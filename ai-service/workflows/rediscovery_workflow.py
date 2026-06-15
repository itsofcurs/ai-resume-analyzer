"""
workflows/rediscovery_workflow.py
---------------------------------
AI Candidate Rediscovery Engine.
Scans historical resumes, reranks them against a new Job Description.
"""

import json
import logging
from typing import Optional, TypedDict

from bson import ObjectId
from database import get_mongo_collection, vector_search
from embeddings import generate_query_embedding
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import END, StateGraph
from services.llm.llm_router import LLMRouter

from utils.parser_utils import clean_json_str

logger = logging.getLogger(__name__)


class RediscoveryState(TypedDict):
    job_id: str
    organization_id: str
    job_description: Optional[str]
    query_vector: Optional[list[float]]
    vector_matches: Optional[list[dict]]
    scored_candidates: Optional[list[dict]]
    error: Optional[str]


class RediscoveryWorkflow:
    def __init__(self):
        graph = StateGraph(RediscoveryState)

        graph.add_node("fetch_job", self._node_fetch_job)
        graph.add_node("vector_search", self._node_vector_search)
        graph.add_node("llm_rerank", self._node_llm_rerank)
        graph.add_node("handle_failure", self._node_handle_failure)

        graph.set_entry_point("fetch_job")

        graph.add_conditional_edges(
            "fetch_job",
            lambda s: "handle_failure" if s.get("error") else "vector_search",
        )
        graph.add_conditional_edges(
            "vector_search",
            lambda s: "handle_failure" if s.get("error") else "llm_rerank",
        )
        graph.add_conditional_edges(
            "llm_rerank", lambda s: "handle_failure" if s.get("error") else END
        )
        graph.add_edge("handle_failure", END)

        self._graph = graph.compile()

    async def _node_fetch_job(self, state: RediscoveryState) -> RediscoveryState:
        try:
            # We would typically fetch from PostgreSQL via Prisma or an API.
            # For this MVP, we assume the JD is either passed or we mock a fetch.
            # In a real scenario, we'd query Prisma `jobDescription`.
            from database import get_prisma_client

            prisma = await get_prisma_client()
            job = await prisma.jobdescription.find_unique(
                where={
                    "id": state["job_id"],
                    "organizationId": state["organization_id"],
                }
            )
            if not job:
                state["error"] = "Job not found"
                return state
            state["job_description"] = job.description
            state["query_vector"] = generate_query_embedding(job.description)
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_vector_search(self, state: RediscoveryState) -> RediscoveryState:
        try:
            # Search archived or all candidates in Mongo
            matches = await vector_search(state["query_vector"], top_k=10)
            state["vector_matches"] = matches
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_llm_rerank(self, state: RediscoveryState) -> RediscoveryState:
        try:
            collection = get_mongo_collection()
            candidates = []
            for m in state["vector_matches"]:
                doc = await collection.find_one(
                    {
                        "_id": ObjectId(m["resume_id"]),
                        "organizationId": state["organization_id"],
                    }
                )
                if doc:
                    candidates.append(
                        {
                            "id": str(doc["_id"]),
                            "name": doc.get("candidateName", "Unknown"),
                            "data": doc.get("parsedData", {}),
                            "semantic_score": m.get("score", 0.0),
                            "success_prob": doc.get("successPrediction", {}).get(
                                "successProbability", 50
                            ),
                            "risk": doc.get("predictiveHiring", {}).get(
                                "flightRisk", 50
                            ),
                        }
                    )

            if not candidates:
                state["scored_candidates"] = []
                return state

            llm = LLMRouter.get_llm("copilot")
            prompt = PromptTemplate.from_template(
                """You are an AI recruiting agent rediscovering past candidates for a new role.
                Job Description: {jd}
                
                Candidates Data:
                {candidates}
                
                Calculate an ATS Rediscovery Match Score (0-100) for each candidate.
                Return ONLY valid JSON:
                {{
                    "results": [
                        {{"id": "candidate_id", "rediscovery_score": 85, "reason": "brief reason"}}
                    ]
                }}"""
            )

            chain = prompt | llm | StrOutputParser()
            res = await chain.ainvoke(
                {"jd": state["job_description"], "candidates": json.dumps(candidates)}
            )
            parsed = json.loads(clean_json_str(res))

            # Merge LLM score with candidate data
            scored = []
            for c in candidates:
                llm_res = next(
                    (r for r in parsed.get("results", []) if r["id"] == c["id"]), None
                )
                rediscovery_score = (
                    llm_res["rediscovery_score"]
                    if llm_res
                    else (c["semantic_score"] * 100)
                )
                reason = llm_res["reason"] if llm_res else "Semantic match"

                scored.append(
                    {
                        "id": c["id"],
                        "name": c["name"],
                        "rediscovery_score": round(rediscovery_score, 1),
                        "semantic_score": round(c["semantic_score"] * 100, 1),
                        "successProbability": c["success_prob"],
                        "riskLevel": c["risk"],
                        "reason": reason,
                    }
                )

            scored.sort(key=lambda x: x["rediscovery_score"], reverse=True)
            state["scored_candidates"] = scored
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_handle_failure(self, state: RediscoveryState) -> RediscoveryState:
        logger.error(f"[REDISCOVERY] Failed: {state.get('error')}")
        return state

    async def run(self, job_id: str, organization_id: str) -> dict:
        state = {
            "job_id": job_id,
            "organization_id": organization_id,
            "job_description": None,
            "query_vector": None,
            "vector_matches": None,
            "scored_candidates": None,
            "error": None,
        }
        final_state = await self._graph.ainvoke(state)
        if final_state.get("error"):
            return {"error": final_state["error"]}
        return {"rediscovery_results": final_state["scored_candidates"]}
