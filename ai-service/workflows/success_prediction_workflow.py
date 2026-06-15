import datetime
import json
import logging
from typing import List, Optional, TypedDict

import httpx
from bson import ObjectId
from core.config import get_settings
from database import get_mongo_collection
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import END, StateGraph
from services.llm.llm_router import LLMRouter

from utils.parser_utils import clean_json_str
from utils.retry_utils import ainvoke_with_retry

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


class SuccessPredictionState(TypedDict):
    resume_id: str
    # Raw Data
    resume_data: Optional[dict]
    ats_scores: Optional[dict]
    interview_evaluation: Optional[dict]
    fraud_analysis: Optional[dict]
    skill_gap_analysis: Optional[dict]
    answer_authenticity: Optional[dict]
    skill_graph: Optional[dict]
    voice_video_analysis: Optional[list]

    # Intermediate Analysis
    behavioral_signals: Optional[str]
    learning_agility: Optional[int]
    adaptability_score: Optional[int]
    communication_potential: Optional[int]
    retention_risk: Optional[str]
    leadership_potential: Optional[str]

    # Final Output
    success_probability: Optional[int]
    growth_trajectory: Optional[str]
    recommended_career_path: Optional[str]
    strengths: Optional[List[str]]
    development_areas: Optional[List[str]]
    executive_summary: Optional[str]
    cultural_fit: Optional[int]

    success_prediction: Optional[dict]
    error: Optional[str]


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

BEHAVIORAL_SIGNALS_PROMPT = PromptTemplate.from_template(
    """Analyze the following candidate data to extract behavioral signals.
CRITICAL: Do NOT use protected characteristics (age, race, gender, religion, national origin, etc.) in your analysis.
This is strictly advisory.

Resume: {resume_json}
Interview: {interview_json}
Fraud/Trust: {fraud_json}
Answer Authenticity: {authenticity_json}

Provide a concise summary (max 300 words) of their behavioral indicators, communication style, and integrity."""
)

AGILITY_ADAPTABILITY_PROMPT = PromptTemplate.from_template(
    """Evaluate learning agility, adaptability, and communication potential based on the candidate's skill gaps, behavioral signals, and interview results.
CRITICAL: Do NOT use protected characteristics.

Behavioral Signals: {behavioral_signals}
Skill Gaps: {skill_gap_json}

Return ONLY a valid JSON object:
{{
    "learningAgility": <number 0-100>,
    "adaptabilityScore": <number 0-100>,
    "communicationPotential": <number 0-100>
}}"""
)

RETENTION_LEADERSHIP_PROMPT = PromptTemplate.from_template(
    """Predict the retention risk and leadership potential of this candidate.
CRITICAL: Do NOT use protected characteristics. Predictions are advisory only.

Behavioral Signals: {behavioral_signals}
ATS Scores: {ats_json}
Learning Agility: {learning_agility}
Answer Authenticity: {authenticity_json}

Return ONLY a valid JSON object:
{{
    "retentionRisk": "LOW" | "MEDIUM" | "HIGH",
    "leadershipPotential": "LOW" | "MEDIUM" | "HIGH" | "EXCEPTIONAL"
}}"""
)

CULTURAL_FIT_PROMPT = PromptTemplate.from_template(
    """Evaluate cultural fit based on the candidate's interview evaluation, fraud analysis, and ATS scores.
CRITICAL: Do NOT use protected characteristics.

Interview Evaluation: {interview_json}
Fraud Analysis: {fraud_json}
ATS Scores: {ats_json}

Return ONLY a valid JSON object:
{{
    "culturalFit": <number 0-100>
}}"""
)

SUCCESS_PREDICTION_PROMPT = PromptTemplate.from_template(
    """You are an expert Talent Intelligence AI. Generate a comprehensive success prediction for this candidate.
CRITICAL MANDATE:
1. DO NOT base any prediction on protected attributes (age, race, gender, religion, etc.).
2. You must explicitly state that this prediction is an advisory estimate, NOT a definitive hiring decision.

Inputs:
- Behavioral Signals: {behavioral_signals}
- Learning Agility: {learning_agility}
- Adaptability Score: {adaptability_score}
- Communication Potential: {communication_potential}
- Retention Risk: {retention_risk}
- Leadership Potential: {leadership_potential}
- Technical Competency Score: {technical_score}
- Soft Skill Competency Score: {soft_score}
- Voice & Video Intelligence Metrics: {voice_video_json}

(Note: High communicationScore, confidenceScore, leadershipPresenceScore, engagementScore, and interviewIntegrityScore from Voice/Video must positively influence successProbability, leadershipPotential, retentionRisk, and growthTrajectory.)

Return ONLY a valid JSON object matching exactly this schema:
{{
    "successProbability": <number 0-100>,
    "growthTrajectory": "<short description, e.g., 'Steady continuous growth' or 'High velocity executive path'>",
    "recommendedCareerPath": "<string>",
    "strengths": ["<string>", "<string>"],
    "developmentAreas": ["<string>", "<string>"],
    "executiveSummary": "<2-3 paragraph summary. MUST include disclaimer that this is advisory only.>"
}}"""
)

# ---------------------------------------------------------------------------
# Workflow
# ---------------------------------------------------------------------------


class SuccessPredictionWorkflow:
    def __init__(self):
        builder = StateGraph(SuccessPredictionState)

        # Nodes
        builder.add_node("load_candidate", self._node_load_candidate)
        builder.add_node("analyze_behavioral_signals", self._node_behavioral)
        builder.add_node("analyze_learning_agility", self._node_agility)
        builder.add_node(
            "predict_retention_leadership", self._node_retention_leadership
        )
        builder.add_node("analyze_cultural_fit", self._node_cultural_fit)
        builder.add_node("generate_success_prediction", self._node_generate)
        builder.add_node("persist_results", self._node_persist)

        builder.set_entry_point("load_candidate")

        # Edges
        builder.add_conditional_edges(
            "load_candidate",
            lambda s: "analyze_behavioral_signals" if not s.get("error") else END,
            ["analyze_behavioral_signals", END],
        )
        builder.add_conditional_edges(
            "analyze_behavioral_signals",
            lambda s: "analyze_learning_agility" if not s.get("error") else END,
            ["analyze_learning_agility", END],
        )
        builder.add_conditional_edges(
            "analyze_learning_agility",
            lambda s: "predict_retention_leadership" if not s.get("error") else END,
            ["predict_retention_leadership", END],
        )
        builder.add_conditional_edges(
            "predict_retention_leadership",
            lambda s: "analyze_cultural_fit" if not s.get("error") else END,
            ["analyze_cultural_fit", END],
        )
        builder.add_conditional_edges(
            "analyze_cultural_fit",
            lambda s: "generate_success_prediction" if not s.get("error") else END,
            ["generate_success_prediction", END],
        )
        builder.add_conditional_edges(
            "generate_success_prediction",
            lambda s: "persist_results" if not s.get("error") else END,
            ["persist_results", END],
        )
        builder.add_edge("persist_results", END)

        self._graph = builder.compile()

    async def _emit_event(self, resume_id: str, event_name: str):
        try:
            settings = get_settings()
            if not settings.node_backend_url:
                return
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{settings.node_backend_url.rstrip('/')}/api/interview/webhook/event",
                    json={"id": resume_id, "event": event_name},
                    headers={
                        "x-api-key": settings.internal_api_key or "default-internal-key"
                    },
                    timeout=2.0,
                )
        except Exception as exc:
            logger.warning(f"[SUCCESS] Failed to emit {event_name}: {exc}")

    def _safe(self, value, default=0):
        if value is None:
            return default
        try:
            return int(value)
        except Exception:
            return default

    async def _node_load_candidate(
        self, state: SuccessPredictionState
    ) -> SuccessPredictionState:
        logger.info(f"[SUCCESS] Stage 1 - Loading candidate {state['resume_id']}")
        await self._emit_event(state["resume_id"], "SUCCESS_ANALYSIS_STARTED")
        try:
            collection = get_mongo_collection()
            resume = await collection.find_one({"_id": ObjectId(state["resume_id"])})
            if not resume:
                state["error"] = "Resume not found"
                await self._emit_event(state["resume_id"], "SUCCESS_ANALYSIS_FAILED")
                return state

            state["resume_data"] = resume.get("parsedData", {})
            state["ats_scores"] = resume.get("atsScores", {})
            state["interview_evaluation"] = resume.get("interviewEvaluation", {})
            state["fraud_analysis"] = resume.get("fraudAnalysis", {})
            state["skill_gap_analysis"] = resume.get("skillGapAnalysis", {})
            state["answer_authenticity"] = resume.get("answerAuthenticity", {})
            state["skill_graph"] = resume.get("skillGraph", {})
            state["voice_video_analysis"] = resume.get("voiceVideoAnalysis", [])
        except Exception as e:
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "SUCCESS_ANALYSIS_FAILED")
        return state

    async def _node_behavioral(
        self, state: SuccessPredictionState
    ) -> SuccessPredictionState:
        if state.get("error"):
            return state
        try:
            llm = LLMRouter.get_llm("interview")
            chain = BEHAVIORAL_SIGNALS_PROMPT | llm | StrOutputParser()
            state["behavioral_signals"] = await ainvoke_with_retry(
                chain,
                {
                    "resume_json": json.dumps(
                        state.get("resume_data", {}), default=str
                    ),
                    "interview_json": json.dumps(
                        state.get("interview_evaluation", {}), default=str
                    ),
                    "fraud_json": json.dumps(
                        state.get("fraud_analysis", {}), default=str
                    ),
                    "authenticity_json": json.dumps(
                        state.get("answer_authenticity", {}), default=str
                    ),
                },
            )
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_agility(
        self, state: SuccessPredictionState
    ) -> SuccessPredictionState:
        if state.get("error"):
            return state
        try:
            llm = LLMRouter.get_llm("interview")
            chain = AGILITY_ADAPTABILITY_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(
                chain,
                {
                    "behavioral_signals": state.get("behavioral_signals", ""),
                    "skill_gap_json": json.dumps(
                        state.get("skill_gap_analysis", {}), default=str
                    ),
                },
            )
            data = json.loads(clean_json_str(raw), strict=False)
            state["learning_agility"] = data.get("learningAgility", 0)
            state["adaptability_score"] = data.get("adaptabilityScore", 0)
            state["communication_potential"] = data.get("communicationPotential", 0)
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_retention_leadership(
        self, state: SuccessPredictionState
    ) -> SuccessPredictionState:
        if state.get("error"):
            return state
        try:
            llm = LLMRouter.get_llm("interview")
            chain = RETENTION_LEADERSHIP_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(
                chain,
                {
                    "behavioral_signals": state.get("behavioral_signals", ""),
                    "ats_json": json.dumps(state.get("ats_scores", {}), default=str),
                    "learning_agility": str(state.get("learning_agility", 0)),
                    "authenticity_json": json.dumps(
                        state.get("answer_authenticity", {}), default=str
                    ),
                },
            )
            data = json.loads(clean_json_str(raw), strict=False)
            state["retention_risk"] = data.get("retentionRisk", "MEDIUM")
            state["leadership_potential"] = data.get("leadershipPotential", "MEDIUM")
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_cultural_fit(
        self, state: SuccessPredictionState
    ) -> SuccessPredictionState:
        if state.get("error"):
            return state
        try:
            llm = LLMRouter.get_llm("interview")
            chain = CULTURAL_FIT_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(
                chain,
                {
                    "interview_json": json.dumps(
                        state.get("interview_evaluation", {}), default=str
                    ),
                    "fraud_json": json.dumps(
                        state.get("fraud_analysis", {}), default=str
                    ),
                    "ats_json": json.dumps(state.get("ats_scores", {}), default=str),
                },
            )
            data = json.loads(clean_json_str(raw), strict=False)
            state["cultural_fit"] = data.get("culturalFit", 0)
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_generate(
        self, state: SuccessPredictionState
    ) -> SuccessPredictionState:
        if state.get("error"):
            return state
        try:
            llm = LLMRouter.get_llm("interview")
            chain = SUCCESS_PREDICTION_PROMPT | llm | StrOutputParser()
            skill_graph = state.get("skill_graph") or {}
            voice_video_analysis = state.get("voice_video_analysis") or []

            raw = await ainvoke_with_retry(
                chain,
                {
                    "behavioral_signals": state.get("behavioral_signals", ""),
                    "learning_agility": str(state.get("learning_agility", 0)),
                    "adaptability_score": str(state.get("adaptability_score", 0)),
                    "communication_potential": str(
                        state.get("communication_potential", 0)
                    ),
                    "retention_risk": state.get("retention_risk", "MEDIUM"),
                    "leadership_potential": state.get("leadership_potential", "MEDIUM"),
                    "technical_score": str(skill_graph.get("overallTechnicalScore", 0)),
                    "soft_score": str(skill_graph.get("overallSoftSkillScore", 0)),
                    "voice_video_json": json.dumps(voice_video_analysis, default=str),
                },
            )
            data = json.loads(clean_json_str(raw), strict=False)
            state["success_probability"] = data.get("successProbability", 0)
            state["growth_trajectory"] = data.get("growthTrajectory", "")
            state["recommended_career_path"] = data.get("recommendedCareerPath", "")
            state["strengths"] = data.get("strengths", [])
            state["development_areas"] = data.get("developmentAreas", [])
            state["executive_summary"] = data.get("executiveSummary", "")
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_persist(
        self, state: SuccessPredictionState
    ) -> SuccessPredictionState:
        if state.get("error"):
            return state
        try:
            prediction = {
                "successProbability": state.get("success_probability", 0),
                "retentionRisk": state.get("retention_risk", "MEDIUM"),
                "leadershipPotential": state.get("leadership_potential", "MEDIUM"),
                "learningAgility": state.get("learning_agility", 0),
                "adaptabilityScore": state.get("adaptability_score", 0),
                "communicationPotential": state.get("communication_potential", 0),
                "growthTrajectory": state.get("growth_trajectory", ""),
                "recommendedCareerPath": state.get("recommended_career_path", ""),
                "strengths": state.get("strengths", []),
                "developmentAreas": state.get("development_areas", []),
                "culturalFit": state.get("cultural_fit", 0),
                "executiveSummary": state.get("executive_summary", ""),
                "predictedAt": datetime.datetime.utcnow().isoformat(),
            }
            state["success_prediction"] = prediction

            collection = get_mongo_collection()
            await collection.update_one(
                {"_id": ObjectId(state["resume_id"])},
                {"$set": {"successPrediction": prediction}},
            )
            await self._emit_event(state["resume_id"], "SUCCESS_ANALYSIS_COMPLETED")
        except Exception as e:
            logger.error(f"[SUCCESS] Failed to persist: {e}")
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "SUCCESS_ANALYSIS_FAILED")
        return state

    async def run(self, resume_id: str) -> dict:
        initial_state: SuccessPredictionState = {
            "resume_id": resume_id,
            "resume_data": None,
            "ats_scores": None,
            "interview_evaluation": None,
            "fraud_analysis": None,
            "skill_gap_analysis": None,
            "behavioral_signals": None,
            "learning_agility": None,
            "adaptability_score": None,
            "communication_potential": None,
            "retention_risk": None,
            "leadership_potential": None,
            "success_probability": None,
            "growth_trajectory": None,
            "recommended_career_path": None,
            "strengths": None,
            "development_areas": None,
            "cultural_fit": None,
            "executive_summary": None,
            "success_prediction": None,
            "error": None,
        }

        result = await self._graph.ainvoke(initial_state)

        if result.get("error"):
            return {"error": result["error"]}

        return result.get("success_prediction", {})
