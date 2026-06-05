import json
import logging
from typing import TypedDict, Optional, List, Dict
from bson import ObjectId
import httpx
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
import datetime

from database import get_mongo_collection
from utils.retry_utils import ainvoke_with_retry
from utils.parser_utils import clean_json_str
from core.config import get_settings
from services.llm.llm_router import LLMRouter

logger = logging.getLogger(__name__)

class InterviewEvaluationState(TypedDict):
    resume_id: str
    answers: List[Dict[str, str]]
    resume_data: Optional[dict]
    evaluation: Optional[dict]
    error: Optional[str]

EVALUATION_PROMPT = PromptTemplate.from_template(
    """You are an expert technical recruiter and interviewer.
    Please evaluate the candidate's interview answers based on their resume context.
    
    Candidate Resume Data:
    {resume_json}
    
    Candidate Answers:
    {answers_json}
    
    Provide a comprehensive evaluation returning ONLY a JSON object with this exact schema:
    {{
        "technicalScore": <number 0-100>,
        "behavioralScore": <number 0-100>,
        "communicationScore": <number 0-100>,
        "confidenceScore": <number 0-100>,
        "overallScore": <number 0-100>,
        "strengths": ["<strength 1>", "<strength 2>", ...],
        "weaknesses": ["<weakness 1>", "<weakness 2>", ...],
        "recruiterSummary": "<2-3 sentence summary>",
        "hireRecommendation": "<Strong Yes | Yes | Borderline | No>"
    }}
    """
)

class InterviewEvaluationWorkflow:
    def __init__(self):
        builder = StateGraph(InterviewEvaluationState)
        
        builder.add_node("load_candidate", self._node_load_candidate)
        builder.add_node("evaluate_answers", self._node_evaluate_answers)
        builder.add_node("persist", self._node_persist)
        
        builder.set_entry_point("load_candidate")
        
        builder.add_conditional_edges(
            "load_candidate",
            lambda s: "evaluate_answers" if not s.get("error") else END,
            ["evaluate_answers", END]
        )
        
        builder.add_conditional_edges(
            "evaluate_answers",
            lambda s: "persist" if not s.get("error") else END,
            ["persist", END]
        )
        
        builder.add_edge("persist", END)
        self._graph = builder.compile()

    async def _emit_event(self, resume_id: str, event_name: str):
        settings = get_settings()
        if not settings.node_backend_url:
            return
        
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{settings.node_backend_url.rstrip('/')}/api/interview/webhook/event",
                    json={"id": resume_id, "event": event_name},
                    headers={"x-api-key": settings.internal_api_key or "default-internal-key"},
                    timeout=2.0
                )
        except Exception as exc:
            logger.warning(f"[INTERVIEW_EVALUATION] Failed to send webhook for {event_name}: {exc}")

    async def _node_load_candidate(self, state: InterviewEvaluationState) -> InterviewEvaluationState:
        logger.info(f"[INTERVIEW_EVALUATION] Stage 1 - Loading candidate {state['resume_id']}")
        try:
            await self._emit_event(state["resume_id"], "INTERVIEW_ANALYZING")
            collection = get_mongo_collection()
            resume = await collection.find_one({"_id": ObjectId(state["resume_id"])})
            if not resume:
                state["error"] = "Resume not found"
                await self._emit_event(state["resume_id"], "INTERVIEW_FAILED")
                return state
            
            state["resume_data"] = resume.get("parsedData", {})
        except Exception as e:
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "INTERVIEW_FAILED")
        return state

    async def _node_evaluate_answers(self, state: InterviewEvaluationState) -> InterviewEvaluationState:
        logger.info("[INTERVIEW_EVALUATION] Stage 2 - Evaluating Answers")
        try:
            await self._emit_event(state["resume_id"], "INTERVIEW_EVALUATING")
            llm = LLMRouter.get_llm("interview")
            chain = EVALUATION_PROMPT | llm | StrOutputParser()
            
            raw_response = await ainvoke_with_retry(
                chain,
                {
                    "resume_json": json.dumps(state.get("resume_data", {})),
                    "answers_json": json.dumps(state.get("answers", []))
                }
            )
            
            cleaned = clean_json_str(raw_response)
            evaluation = json.loads(cleaned)
            evaluation["evaluatedAt"] = datetime.datetime.utcnow().isoformat()
            
            state["evaluation"] = evaluation
            
        except Exception as e:
            logger.error(f"[INTERVIEW_EVALUATION] Failed to evaluate: {e}")
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "INTERVIEW_FAILED")
            
        return state

    async def _node_persist(self, state: InterviewEvaluationState) -> InterviewEvaluationState:
        logger.info("[INTERVIEW_EVALUATION] Stage 3 - Persist Results")
        try:
            collection = get_mongo_collection()
            await collection.update_one(
                {"_id": ObjectId(state["resume_id"])},
                {"$set": {"interviewEvaluation": state["evaluation"]}}
            )
            await self._emit_event(state["resume_id"], "INTERVIEW_COMPLETED")
        except Exception as e:
            logger.error(f"[INTERVIEW_EVALUATION] Failed to persist evaluation: {e}")
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "INTERVIEW_FAILED")
        return state

    async def run(self, resume_id: str, answers: List[Dict[str, str]]) -> dict:
        initial_state: InterviewEvaluationState = {
            "resume_id": resume_id,
            "answers": answers,
            "resume_data": None,
            "evaluation": None,
            "error": None
        }
        
        result_state = await self._graph.ainvoke(initial_state)
        
        if result_state.get("error"):
            return {"error": result_state["error"]}
            
        # Fire and forget Fraud Detection (Phase 2C-B)
        try:
            import asyncio
            from workflows.fraud_detection_workflow import FraudDetectionWorkflow
            fraud_workflow = FraudDetectionWorkflow()
            asyncio.create_task(fraud_workflow.run(resume_id))
        except Exception as e:
            logger.error(f"[INTERVIEW_EVALUATION] Failed to trigger fraud detection automatically: {e}")

        return result_state["evaluation"]
