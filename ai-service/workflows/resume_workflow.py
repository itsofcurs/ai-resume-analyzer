"""
workflows/resume_workflow.py
-----------------------------
ResumeWorkflow — orchestrates the full resume processing pipeline using LangGraph.

This is the single entry point called by the FastAPI /api/process handler.
It uses a StateGraph to process the resume step-by-step.

Pipeline stages:
  1. Text extraction          → nlp_pipeline.download_and_extract_text()
  2. Structured parsing       → ResumeParserAgent.aparse()
  3. Vector embedding         → embeddings.generate_embedding()
  4. MongoDB vector storage   → database.store_vector()
  5. ATS scoring              → Standalone resume quality scoring
  6. Candidate ranking        → Grade/Tier/Priority classification
  7. MongoDB status update    → database.get_mongo_collection()
"""

import json
import logging
import time
from typing import Optional, TypedDict

from agents.resume_parser import ResumeParserAgent
from bson import ObjectId
from database import get_mongo_collection, store_vector
from embeddings import generate_embedding
from langchain_core.output_parsers import StrOutputParser
from langgraph.graph import END, StateGraph
from nlp_pipeline import download_and_extract_text
from prompts.ats_scoring_prompt import ATS_SCORING_PROMPT
from prompts.candidate_ranking_prompt import CANDIDATE_RANKING_PROMPT
from schemas.ats_ranking_schema import (
    CandidateRankingResultSchema,
    StandaloneATSScoreSchema,
)
from schemas.resume_schema import ResumeParseResponse
from services.llm.llm_router import LLMRouter

from utils.parser_utils import clean_json_str

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# LangGraph State Definition
# ---------------------------------------------------------------------------
class ResumeState(TypedDict):
    resume_id: str
    cloudinary_url: str
    filename: str
    raw_text: Optional[str]
    parsed: Optional[ResumeParseResponse]
    vector: Optional[list[float]]
    vector_stored: bool
    ats_scores: Optional[StandaloneATSScoreSchema]
    ranking: Optional[CandidateRankingResultSchema]
    error: Optional[str]


class ResumeWorkflow:
    """
    Orchestrates the full resume ingestion and AI analysis pipeline using LangGraph.
    """

    _parser_agent: ResumeParserAgent = ResumeParserAgent()

    def __init__(self):
        # Build the LangGraph
        graph = StateGraph(ResumeState)

        # Add Nodes
        graph.add_node("extract_text", self._node_extract_text)
        graph.add_node("parse_resume", self._node_parse_resume)
        graph.add_node("generate_embedding", self._node_generate_embedding)
        graph.add_node("store_vector", self._node_store_vector)
        graph.add_node("ats_scoring", self._node_ats_scoring)
        graph.add_node("candidate_ranking", self._node_candidate_ranking)
        graph.add_node("update_mongo", self._node_update_mongo)
        graph.add_node("handle_failure", self._node_handle_failure)

        # Define Edges
        graph.set_entry_point("extract_text")

        # Conditional edges from extract_text
        graph.add_conditional_edges(
            "extract_text",
            lambda state: "handle_failure" if state.get("error") else "parse_resume",
        )

        # Conditional edges from parse_resume
        graph.add_conditional_edges(
            "parse_resume",
            lambda state: (
                "handle_failure" if state.get("error") else "generate_embedding"
            ),
        )

        # Conditional edges from generate_embedding
        graph.add_conditional_edges(
            "generate_embedding",
            lambda state: "store_vector" if state.get("vector") else "ats_scoring",
        )

        # Conditional edges from store_vector
        graph.add_conditional_edges(
            "store_vector",
            lambda state: "handle_failure" if state.get("error") else "ats_scoring",
        )

        # Conditional edges from ats_scoring (non-fatal: skip to ranking on error)
        graph.add_conditional_edges("ats_scoring", lambda state: "candidate_ranking")

        # Conditional edges from candidate_ranking
        graph.add_conditional_edges("candidate_ranking", lambda state: "update_mongo")

        # Conditional edges from update_mongo
        graph.add_conditional_edges(
            "update_mongo",
            lambda state: "handle_failure" if state.get("error") else END,
        )

        graph.add_edge("handle_failure", END)

        self._graph = graph.compile()

    # ---------------------------------------------------------------------------
    # MongoDB helpers
    # ---------------------------------------------------------------------------
    @staticmethod
    async def _set_status(resume_id: str, status: str, **extra_fields) -> None:
        import httpx
        from core.config import get_settings

        collection = get_mongo_collection()
        update_payload = {"status": status, **extra_fields}
        await collection.update_one(
            {"_id": ObjectId(resume_id)},
            {"$set": update_payload},
        )

        # Notify Node.js gateway via webhook for real-time Socket.io updates
        try:
            settings = get_settings()
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{settings.node_backend_url.rstrip('/')}/api/resumes/webhook/status",
                    json={"id": resume_id, "status": status},
                    headers={
                        "x-api-key": settings.internal_api_key or "default-internal-key"
                    },
                    timeout=2.0,
                )
        except Exception as exc:
            logger.warning(
                f"[WORKFLOW] Failed to send status webhook to Node gateway: {exc}"
            )

    # ---------------------------------------------------------------------------
    # LangGraph Nodes
    # ---------------------------------------------------------------------------
    async def _node_extract_text(self, state: ResumeState) -> ResumeState:
        logger.info(
            f"[WORKFLOW] Stage 1 — Text extraction started for {state['resume_id']}"
        )
        try:
            raw_text = download_and_extract_text(
                state["cloudinary_url"], state["filename"]
            )
            if not raw_text or not raw_text.strip():
                state["error"] = "Extracted text is empty"
                return state
            await self._set_status(state["resume_id"], "EXTRACTING", rawText=raw_text)
            state["raw_text"] = raw_text
        except Exception as exc:
            logger.error(f"[WORKFLOW] Stage 1 FAILED: {exc}")
            state["error"] = str(exc)
        return state

    async def _node_parse_resume(self, state: ResumeState) -> ResumeState:
        logger.info(
            f"[WORKFLOW] Stage 2 — Agent parsing started for {state['resume_id']}"
        )
        try:
            parsed = await self._parser_agent.aparse(state["raw_text"])
            await self._set_status(state["resume_id"], "ANALYZING")
            state["parsed"] = parsed
        except Exception as exc:
            logger.error(f"[WORKFLOW] Stage 2 FAILED: {exc}")
            state["error"] = str(exc)
        return state

    async def _node_generate_embedding(self, state: ResumeState) -> ResumeState:
        logger.info(
            f"[WORKFLOW] Stage 3 — Embedding generation for {state['resume_id']}"
        )
        try:
            vector = generate_embedding(state["raw_text"])
            state["vector"] = vector
        except Exception as exc:
            logger.error(f"[WORKFLOW] Stage 3 FAILED: {exc}")
            state["vector"] = None
        return state

    async def _node_store_vector(self, state: ResumeState) -> ResumeState:
        logger.info(f"[WORKFLOW] Stage 4 — Storing vector for {state['resume_id']}")
        try:
            vector_stored = await store_vector(
                resume_id=state["resume_id"],
                vector=state["vector"],
                filename=state["filename"],
                name=state["parsed"].name,
                skills=state["parsed"].skills,
            )
            state["vector_stored"] = vector_stored
        except Exception as exc:
            logger.error(f"[WORKFLOW] Stage 4 FAILED: {exc}")
            state["error"] = str(exc)
        return state

    async def _node_ats_scoring(self, state: ResumeState) -> ResumeState:
        logger.info(f"[WORKFLOW] Stage 5 — ATS scoring for {state['resume_id']}")
        try:
            await self._set_status(state["resume_id"], "SCORING")

            parsed = state["parsed"]
            resume_json = json.dumps(
                parsed.model_dump(exclude_none=True), ensure_ascii=False
            )

            llm = LLMRouter.get_llm("ats_scoring")
            chain = ATS_SCORING_PROMPT | llm | StrOutputParser()
            raw_response = await chain.ainvoke({"resume_json": resume_json})
            cleaned = clean_json_str(raw_response)
            scores_dict = json.loads(cleaned)
            state["ats_scores"] = StandaloneATSScoreSchema(**scores_dict)
            logger.info(
                f"[WORKFLOW] ATS scores for {state['resume_id']}: overall={state['ats_scores'].overall_score}"
            )
        except Exception as exc:
            logger.error(f"[WORKFLOW] Stage 5 ATS scoring FAILED (non-fatal): {exc}")
            state["ats_scores"] = StandaloneATSScoreSchema()  # safe defaults
        return state

    async def _node_candidate_ranking(self, state: ResumeState) -> ResumeState:
        logger.info(f"[WORKFLOW] Stage 6 — Candidate ranking for {state['resume_id']}")
        try:
            await self._set_status(state["resume_id"], "RANKING")

            parsed = state["parsed"]
            resume_json = json.dumps(
                parsed.model_dump(exclude_none=True), ensure_ascii=False
            )
            ats_scores = state.get("ats_scores") or StandaloneATSScoreSchema()
            ats_json = json.dumps(ats_scores.model_dump(), ensure_ascii=False)

            llm = LLMRouter.get_llm("ranking")
            chain = CANDIDATE_RANKING_PROMPT | llm | StrOutputParser()
            raw_response = await chain.ainvoke(
                {"resume_json": resume_json, "ats_scores_json": ats_json}
            )
            cleaned = clean_json_str(raw_response)
            ranking_dict = json.loads(cleaned)
            state["ranking"] = CandidateRankingResultSchema(**ranking_dict)
            logger.info(
                f"[WORKFLOW] Ranking for {state['resume_id']}: grade={state['ranking'].grade}, "
                f"tier={state['ranking'].tier}, priority={state['ranking'].hiring_priority}"
            )
        except Exception as exc:
            logger.error(
                f"[WORKFLOW] Stage 6 Candidate ranking FAILED (non-fatal): {exc}"
            )
            state["ranking"] = CandidateRankingResultSchema()  # safe defaults
        return state

    async def _node_update_mongo(self, state: ResumeState) -> ResumeState:
        logger.info(
            f"[WORKFLOW] Stage 7 — MongoDB final update for {state['resume_id']}"
        )
        try:
            parsed = state["parsed"]
            parsed_data = parsed.to_parsed_data()
            ai_analysis = parsed.to_ai_analysis()

            # Build ATS and ranking dicts for MongoDB
            ats_data = None
            if state.get("ats_scores"):
                ats_data = state["ats_scores"].model_dump()

            ranking_data = None
            if state.get("ranking"):
                ranking_data = state["ranking"].model_dump()

            await self._set_status(
                state["resume_id"],
                status="PROCESSED",
                parsedData=parsed_data,
                aiAnalysis=ai_analysis,
                atsScores=ats_data,
                candidateRanking=ranking_data,
                candidateName=parsed.name,
                candidateEmail=parsed.email or "",
                candidatePhone=parsed.phone or "",
                embeddingsId=state["resume_id"] if state.get("vector_stored") else None,
                rawText="",
            )
        except Exception as exc:
            logger.error(f"[WORKFLOW] Stage 7 FAILED: {exc}")
            state["error"] = str(exc)
        return state

    async def _node_handle_failure(self, state: ResumeState) -> ResumeState:
        logger.error(
            f"[WORKFLOW] Handling failure for {state['resume_id']}: {state.get('error')}"
        )
        await self._set_status(state["resume_id"], "FAILED")
        return state

    # ---------------------------------------------------------------------------
    # Main orchestrator (FastAPI entrypoint)
    # ---------------------------------------------------------------------------
    async def run(
        self,
        resume_id: str,
        cloudinary_url: str,
        filename: str,
    ) -> None:
        """
        Execute the full resume processing pipeline asynchronously using LangGraph.
        """
        pipeline_start = time.time()
        logger.info(f"[WORKFLOW] Starting LangGraph pipeline for resume_id={resume_id}")

        initial_state: ResumeState = {
            "resume_id": resume_id,
            "cloudinary_url": cloudinary_url,
            "filename": filename,
            "raw_text": None,
            "parsed": None,
            "vector": None,
            "vector_stored": False,
            "ats_scores": None,
            "ranking": None,
            "error": None,
        }

        try:
            final_state = await self._graph.ainvoke(initial_state)

            total_time = time.time() - pipeline_start

            if final_state.get("error"):
                logger.error(
                    f"[WORKFLOW] LangGraph pipeline FAILED for {resume_id} in {total_time:.2f}s"
                )
            else:
                logger.info(
                    f"[WORKFLOW] LangGraph pipeline COMPLETE for resume_id={resume_id} in {total_time:.2f}s"
                )
        except Exception as exc:
            logger.error(f"[WORKFLOW] LangGraph execution crashed: {exc}")
            await self._set_status(resume_id, "FAILED")
