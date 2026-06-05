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

class ClaimObj(TypedDict):
    claim: str
    evidence: str
    confidence: int

class FraudDetectionState(TypedDict):
    resume_id: str
    resume_data: Optional[dict]
    interview_evaluation: Optional[dict]
    skill_analysis: Optional[str]
    project_analysis: Optional[str]
    timeline_analysis: Optional[str]
    contradictions_detected: Optional[str]
    fraud_analysis: Optional[dict]
    error: Optional[str]

SKILL_ANALYSIS_PROMPT = PromptTemplate.from_template(
    """Analyze the candidate's skills based on their parsed resume and interview evaluation.
    
    Resume Data:
    {resume_json}
    
    Interview Evaluation:
    {interview_json}
    
    Does the candidate's demonstrated knowledge in the interview match the skills claimed on their resume? Are there major discrepancies in technical depth? Output a brief analysis."""
)

PROJECT_ANALYSIS_PROMPT = PromptTemplate.from_template(
    """Analyze the candidate's projects based on their parsed resume and interview evaluation.
    
    Resume Data:
    {resume_json}
    
    Interview Evaluation:
    {interview_json}
    
    Do the interview answers align with the scope, impact, and complexity of the projects claimed on the resume? Output a brief analysis."""
)

TIMELINE_ANALYSIS_PROMPT = PromptTemplate.from_template(
    """Analyze the candidate's experience timeline from their resume.
    
    Resume Data:
    {resume_json}
    
    Are there any overlapping jobs that seem physically impossible or highly suspicious? Are there unexplained gaps that are covered up? Output a brief analysis."""
)

CONTRADICTION_PROMPT = PromptTemplate.from_template(
    """Synthesize the previous analyses to detect contradictions.
    
    Skill Analysis: {skill_analysis}
    Project Analysis: {project_analysis}
    Timeline Analysis: {timeline_analysis}
    
    Identify any clear contradictions or highly suspicious patterns. Output a brief analysis."""
)

SCORE_PROMPT = PromptTemplate.from_template(
    """You are an expert fraud investigator and technical recruiter. Based on all the gathered evidence, calculate the final trust metrics for this candidate.
    
    Skill Analysis: {skill_analysis}
    Project Analysis: {project_analysis}
    Timeline Analysis: {timeline_analysis}
    Contradictions: {contradictions}
    
    Return ONLY a JSON object with this exact schema:
    {{
        "fraudRisk": "LOW" | "MEDIUM" | "HIGH",
        "trustScore": <number 0-100>,
        "consistencyScore": <number 0-100>,
        "suspiciousClaims": [ {{"claim": "<claim>", "evidence": "<evidence>", "confidence": <0-100>}} ],
        "contradictions": ["<contradiction 1>", ...],
        "verifiedClaims": [ {{"claim": "<claim>", "evidence": "<evidence>", "confidence": <0-100>}} ],
        "recruiterAlert": "<Warning message to recruiter if any>",
        "finalAssessment": "<1-2 sentences overall assessment>",
        "hiringImpact": "<Critical | High | Moderate | Low>",
        "recruiterDecision": "<Proceed | Proceed with Caution | Reject>"
    }}
    """
)

class FraudDetectionWorkflow:
    def __init__(self):
        builder = StateGraph(FraudDetectionState)
        
        builder.add_node("load_candidate", self._node_load_candidate)
        builder.add_node("analyze_skills", self._node_analyze_skills)
        builder.add_node("analyze_projects", self._node_analyze_projects)
        builder.add_node("analyze_timeline", self._node_analyze_timeline)
        builder.add_node("detect_contradictions", self._node_detect_contradictions)
        builder.add_node("calculate_score", self._node_calculate_score)
        builder.add_node("persist", self._node_persist)
        
        builder.set_entry_point("load_candidate")
        
        builder.add_conditional_edges("load_candidate", lambda s: "analyze_skills" if not s.get("error") else END, ["analyze_skills", END])
        builder.add_conditional_edges("analyze_skills", lambda s: "analyze_projects" if not s.get("error") else END, ["analyze_projects", END])
        builder.add_conditional_edges("analyze_projects", lambda s: "analyze_timeline" if not s.get("error") else END, ["analyze_timeline", END])
        builder.add_conditional_edges("analyze_timeline", lambda s: "detect_contradictions" if not s.get("error") else END, ["detect_contradictions", END])
        builder.add_conditional_edges("detect_contradictions", lambda s: "calculate_score" if not s.get("error") else END, ["calculate_score", END])
        builder.add_conditional_edges("calculate_score", lambda s: "persist" if not s.get("error") else END, ["persist", END])
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
            logger.warning(f"[FRAUD] Failed to send webhook for {event_name}: {exc}")

    async def _node_load_candidate(self, state: FraudDetectionState) -> FraudDetectionState:
        logger.info(f"[FRAUD] Stage 1 - Loading candidate {state['resume_id']}")
        try:
            await self._emit_event(state["resume_id"], "FRAUD_ANALYZING")
            collection = get_mongo_collection()
            resume = await collection.find_one({"_id": ObjectId(state["resume_id"])})
            if not resume:
                state["error"] = "Resume not found"
                await self._emit_event(state["resume_id"], "FRAUD_FAILED")
                return state
            
            state["resume_data"] = resume.get("parsedData", {})
            state["interview_evaluation"] = resume.get("interviewEvaluation", {})
            if not state["interview_evaluation"]:
                state["error"] = "Interview Evaluation missing"
                await self._emit_event(state["resume_id"], "FRAUD_FAILED")
                return state
        except Exception as e:
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "FRAUD_FAILED")
        return state

    async def _node_analyze_skills(self, state: FraudDetectionState) -> FraudDetectionState:
        logger.info("[FRAUD] Stage 2 - Analyzing Skills Consistency")
        try:
            await self._emit_event(state["resume_id"], "CONSISTENCY_CHECKING")
            llm = LLMRouter.get_llm("interview")
            chain = SKILL_ANALYSIS_PROMPT | llm | StrOutputParser()
            state["skill_analysis"] = await ainvoke_with_retry(
                chain,
                {
                    "resume_json": json.dumps(state.get("resume_data", {})),
                    "interview_json": json.dumps(state.get("interview_evaluation", {}))
                }
            )
        except Exception as e:
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "FRAUD_FAILED")
        return state

    async def _node_analyze_projects(self, state: FraudDetectionState) -> FraudDetectionState:
        logger.info("[FRAUD] Stage 3 - Analyzing Projects Consistency")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = PROJECT_ANALYSIS_PROMPT | llm | StrOutputParser()
            state["project_analysis"] = await ainvoke_with_retry(
                chain,
                {
                    "resume_json": json.dumps(state.get("resume_data", {})),
                    "interview_json": json.dumps(state.get("interview_evaluation", {}))
                }
            )
        except Exception as e:
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "FRAUD_FAILED")
        return state

    async def _node_analyze_timeline(self, state: FraudDetectionState) -> FraudDetectionState:
        logger.info("[FRAUD] Stage 4 - Analyzing Timeline Consistency")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = TIMELINE_ANALYSIS_PROMPT | llm | StrOutputParser()
            state["timeline_analysis"] = await ainvoke_with_retry(
                chain,
                {"resume_json": json.dumps(state.get("resume_data", {}))}
            )
        except Exception as e:
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "FRAUD_FAILED")
        return state

    async def _node_detect_contradictions(self, state: FraudDetectionState) -> FraudDetectionState:
        logger.info("[FRAUD] Stage 5 - Detecting Contradictions")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = CONTRADICTION_PROMPT | llm | StrOutputParser()
            state["contradictions_detected"] = await ainvoke_with_retry(
                chain,
                {
                    "skill_analysis": state.get("skill_analysis", ""),
                    "project_analysis": state.get("project_analysis", ""),
                    "timeline_analysis": state.get("timeline_analysis", "")
                }
            )
        except Exception as e:
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "FRAUD_FAILED")
        return state

    async def _node_calculate_score(self, state: FraudDetectionState) -> FraudDetectionState:
        logger.info("[FRAUD] Stage 6 - Calculating Trust Score")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = SCORE_PROMPT | llm | StrOutputParser()
            raw_response = await ainvoke_with_retry(
                chain,
                {
                    "skill_analysis": state.get("skill_analysis", ""),
                    "project_analysis": state.get("project_analysis", ""),
                    "timeline_analysis": state.get("timeline_analysis", ""),
                    "contradictions": state.get("contradictions_detected", "")
                }
            )
            cleaned = clean_json_str(raw_response)
            try:
                fraud_analysis = json.loads(cleaned)
            except Exception as e:
                # Fallback empty analysis if JSON fails
                logger.warning(f"Failed to parse fraud JSON: {e}")
                fraud_analysis = {
                    "fraudRisk": "HIGH",
                    "trustScore": 0,
                    "consistencyScore": 0,
                    "suspiciousClaims": [],
                    "contradictions": [f"Parsing error: {e}"],
                    "verifiedClaims": [],
                    "recruiterAlert": "Failed to parse AI output for fraud detection.",
                    "finalAssessment": "Error during analysis.",
                    "hiringImpact": "Critical",
                    "recruiterDecision": "Reject"
                }

            fraud_analysis["analyzedAt"] = datetime.datetime.utcnow().isoformat()
            state["fraud_analysis"] = fraud_analysis
        except Exception as e:
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "FRAUD_FAILED")
        return state

    async def _node_persist(self, state: FraudDetectionState) -> FraudDetectionState:
        logger.info("[FRAUD] Stage 7 - Persist Results")
        try:
            collection = get_mongo_collection()
            await collection.update_one(
                {"_id": ObjectId(state["resume_id"])},
                {"$set": {"fraudAnalysis": state["fraud_analysis"]}}
            )
            await self._emit_event(state["resume_id"], "FRAUD_COMPLETED")
        except Exception as e:
            logger.error(f"[FRAUD] Failed to persist: {e}")
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "FRAUD_FAILED")
        return state

    async def run(self, resume_id: str) -> dict:
        initial_state: FraudDetectionState = {
            "resume_id": resume_id,
            "resume_data": None,
            "interview_evaluation": None,
            "skill_analysis": None,
            "project_analysis": None,
            "timeline_analysis": None,
            "contradictions_detected": None,
            "fraud_analysis": None,
            "error": None
        }
        
        result_state = await self._graph.ainvoke(initial_state)
        
        if result_state.get("error"):
            return {"error": result_state["error"]}
            
        return result_state["fraud_analysis"]
