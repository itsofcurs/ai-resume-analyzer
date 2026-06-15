import datetime
import json
import logging
from typing import Optional, TypedDict

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


class PredictiveHiringState(TypedDict):
    resume_id: str
    resume_data: Optional[dict]
    ats_scores: Optional[dict]
    interview_evaluation: Optional[dict]
    fraud_analysis: Optional[dict]
    skill_gap_analysis: Optional[dict]
    candidate_ranking: Optional[dict]
    # Intermediate analysis
    signal_profile: Optional[str]
    # Final outputs
    success_score: Optional[int]
    retention_risk: Optional[str]
    team_fit_score: Optional[int]
    leadership_potential: Optional[str]
    onboarding_difficulty: Optional[str]
    promotion_potential: Optional[str]
    hiring_decision: Optional[str]
    hiring_confidence: Optional[int]
    explanation: Optional[str]
    predictive_hiring: Optional[dict]
    error: Optional[str]


# ---------------------------------------------------------------------------
# Prompts (4 prompts to minimize LLM calls)
# ---------------------------------------------------------------------------

SIGNAL_SYNTHESIS_PROMPT = PromptTemplate.from_template(
    """You are a workforce analytics expert. Synthesize ALL the following candidate data
into a comprehensive signal profile that will be used for predictive hiring decisions.

Resume Data: {resume_json}
ATS Scores: {ats_json}
Interview Evaluation: {interview_json}
Fraud Analysis: {fraud_json}
Skill Gap Analysis: {skill_gap_json}
Candidate Ranking: {ranking_json}

Produce a structured analysis covering:
1. Technical Signal Strength (based on ATS, interview scores, skills depth)
2. Integrity Signal (based on fraud risk, trust score, consistency)
3. Growth Signal (based on skill gaps, learning agility, growth potential)
4. Experience Signal (based on years of experience, project complexity, education quality)

Output a concise analytical narrative (max 500 words)."""
)

SUCCESS_RETENTION_PROMPT = PromptTemplate.from_template(
    """Based on this candidate signal profile, predict hiring success and retention risk.

Signal Profile:
{signal_profile}

Interview Score: {interview_score}
Trust Score: {trust_score}
Hiring Readiness: {hiring_readiness}
ATS Score: {ats_score}

Return ONLY a valid JSON object:
{{
    "successScore": <number 0-100, probability of success in the role>,
    "retentionRisk": "LOW" | "MEDIUM" | "HIGH",
    "retentionReasoning": "<1 sentence why>"
}}"""
)

LEADERSHIP_FIT_PROMPT = PromptTemplate.from_template(
    """Assess this candidate's leadership potential, team fit, onboarding complexity,
and promotion trajectory.

Signal Profile:
{signal_profile}

Skill Gap Weaknesses: {weaknesses}
Growth Potential Score: {growth_potential}
Fraud Risk: {fraud_risk}

Return ONLY a valid JSON object:
{{
    "teamFitScore": <number 0-100>,
    "leadershipPotential": "LOW" | "MEDIUM" | "HIGH" | "EXCEPTIONAL",
    "onboardingDifficulty": "EASY" | "MODERATE" | "COMPLEX",
    "promotionPotential": "LOW" | "MEDIUM" | "HIGH"
}}"""
)

HIRING_DECISION_PROMPT = PromptTemplate.from_template(
    """You are a senior VP of Talent Acquisition making the final hiring recommendation.

Signal Profile: {signal_profile}

Metrics:
- Success Score: {success_score}
- Retention Risk: {retention_risk}
- Team Fit Score: {team_fit_score}
- Leadership Potential: {leadership_potential}
- Onboarding Difficulty: {onboarding_difficulty}
- Promotion Potential: {promotion_potential}

Return ONLY a valid JSON object:
{{
    "hiringDecision": "Strong Hire" | "Hire" | "Conditional Hire" | "Do Not Hire",
    "hiringConfidence": <number 0-100>,
    "explanation": "<2-3 sentence executive summary>"
}}"""
)


# ---------------------------------------------------------------------------
# Workflow
# ---------------------------------------------------------------------------


class PredictiveHiringWorkflow:
    def __init__(self):
        builder = StateGraph(PredictiveHiringState)

        builder.add_node("load_candidate", self._node_load_candidate)
        builder.add_node("evaluate_historical_signals", self._node_evaluate_signals)
        builder.add_node("calculate_success_probability", self._node_calc_success)
        builder.add_node(
            "calculate_retention_risk", self._node_calc_success
        )  # combined with success
        builder.add_node("calculate_team_fit", self._node_calc_leadership_fit)
        builder.add_node(
            "calculate_leadership_potential", self._node_calc_leadership_fit
        )  # combined
        builder.add_node("generate_hiring_decision", self._node_generate_decision)
        builder.add_node("persist_results", self._node_persist)

        builder.set_entry_point("load_candidate")

        # Linear chain with error short-circuits
        builder.add_conditional_edges(
            "load_candidate",
            lambda s: "evaluate_historical_signals" if not s.get("error") else END,
            ["evaluate_historical_signals", END],
        )
        builder.add_conditional_edges(
            "evaluate_historical_signals",
            lambda s: "calculate_success_probability" if not s.get("error") else END,
            ["calculate_success_probability", END],
        )
        builder.add_conditional_edges(
            "calculate_success_probability",
            lambda s: "calculate_team_fit" if not s.get("error") else END,
            ["calculate_team_fit", END],
        )
        builder.add_conditional_edges(
            "calculate_team_fit",
            lambda s: "generate_hiring_decision" if not s.get("error") else END,
            ["generate_hiring_decision", END],
        )
        builder.add_conditional_edges(
            "generate_hiring_decision",
            lambda s: "persist_results" if not s.get("error") else END,
            ["persist_results", END],
        )
        builder.add_edge("persist_results", END)

        self._graph = builder.compile()

    # ---- helpers ----

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
            logger.warning(f"[PREDICTIVE] Failed to emit {event_name}: {exc}")

    def _safe(self, value, default=0):
        """Safely coerce a value to a number."""
        if value is None:
            return default
        try:
            return int(value)
        except (ValueError, TypeError):
            return default

    # ---- nodes ----

    async def _node_load_candidate(
        self, state: PredictiveHiringState
    ) -> PredictiveHiringState:
        logger.info(f"[PREDICTIVE] Stage 1 — Loading candidate {state['resume_id']}")
        await self._emit_event(state["resume_id"], "PREDICTIVE_ANALYZING")
        try:
            collection = get_mongo_collection()
            resume = await collection.find_one({"_id": ObjectId(state["resume_id"])})
            if not resume:
                state["error"] = "Resume not found"
                await self._emit_event(state["resume_id"], "PREDICTIVE_FAILED")
                return state

            state["resume_data"] = resume.get("parsedData", {})
            state["ats_scores"] = resume.get("atsScores", {})
            state["interview_evaluation"] = resume.get("interviewEvaluation", {})
            state["fraud_analysis"] = resume.get("fraudAnalysis", {})
            state["skill_gap_analysis"] = resume.get("skillGapAnalysis", {})
            state["candidate_ranking"] = resume.get("candidateRanking", {})
        except Exception as e:
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "PREDICTIVE_FAILED")
        return state

    async def _node_evaluate_signals(
        self, state: PredictiveHiringState
    ) -> PredictiveHiringState:
        if state.get("error"):
            return state
        logger.info("[PREDICTIVE] Stage 2 — Evaluating historical signals")
        await self._emit_event(state["resume_id"], "SUCCESS_SCORING")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = SIGNAL_SYNTHESIS_PROMPT | llm | StrOutputParser()
            state["signal_profile"] = await ainvoke_with_retry(
                chain,
                {
                    "resume_json": json.dumps(
                        state.get("resume_data", {}), default=str
                    ),
                    "ats_json": json.dumps(state.get("ats_scores", {}), default=str),
                    "interview_json": json.dumps(
                        state.get("interview_evaluation", {}), default=str
                    ),
                    "fraud_json": json.dumps(
                        state.get("fraud_analysis", {}), default=str
                    ),
                    "skill_gap_json": json.dumps(
                        state.get("skill_gap_analysis", {}), default=str
                    ),
                    "ranking_json": json.dumps(
                        state.get("candidate_ranking", {}), default=str
                    ),
                },
            )
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_calc_success(
        self, state: PredictiveHiringState
    ) -> PredictiveHiringState:
        if state.get("error"):
            return state
        logger.info(
            "[PREDICTIVE] Stage 3 — Calculating success probability & retention risk"
        )
        await self._emit_event(state["resume_id"], "RETENTION_ANALYZING")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = SUCCESS_RETENTION_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(
                chain,
                {
                    "signal_profile": state.get("signal_profile", ""),
                    "interview_score": str(
                        self._safe(
                            (state.get("interview_evaluation") or {}).get(
                                "overall_score"
                            )
                        )
                    ),
                    "trust_score": str(
                        self._safe(
                            (state.get("fraud_analysis") or {}).get("trustScore")
                        )
                    ),
                    "hiring_readiness": str(
                        self._safe(
                            (state.get("skill_gap_analysis") or {}).get(
                                "hiringReadinessScore"
                            )
                        )
                    ),
                    "ats_score": str(
                        self._safe((state.get("ats_scores") or {}).get("overall_score"))
                    ),
                },
            )
            data = json.loads(clean_json_str(raw))
            state["success_score"] = data.get("successScore", 0)
            state["retention_risk"] = data.get("retentionRisk", "MEDIUM")
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_calc_leadership_fit(
        self, state: PredictiveHiringState
    ) -> PredictiveHiringState:
        if state.get("error"):
            return state
        logger.info(
            "[PREDICTIVE] Stage 4 — Calculating leadership potential & team fit"
        )
        await self._emit_event(state["resume_id"], "TEAM_FIT_ANALYZING")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = LEADERSHIP_FIT_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(
                chain,
                {
                    "signal_profile": state.get("signal_profile", ""),
                    "weaknesses": json.dumps(
                        (state.get("skill_gap_analysis") or {}).get("weaknesses", [])
                    ),
                    "growth_potential": str(
                        self._safe(
                            (state.get("skill_gap_analysis") or {}).get(
                                "growthPotentialScore"
                            )
                        )
                    ),
                    "fraud_risk": str(
                        (state.get("fraud_analysis") or {}).get("fraudRisk", "UNKNOWN")
                    ),
                },
            )
            data = json.loads(clean_json_str(raw))
            state["team_fit_score"] = data.get("teamFitScore", 0)
            state["leadership_potential"] = data.get("leadershipPotential", "MEDIUM")
            state["onboarding_difficulty"] = data.get(
                "onboardingDifficulty", "MODERATE"
            )
            state["promotion_potential"] = data.get("promotionPotential", "MEDIUM")
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_generate_decision(
        self, state: PredictiveHiringState
    ) -> PredictiveHiringState:
        if state.get("error"):
            return state
        logger.info("[PREDICTIVE] Stage 5 — Generating final hiring decision")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = HIRING_DECISION_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(
                chain,
                {
                    "signal_profile": state.get("signal_profile", ""),
                    "success_score": str(state.get("success_score", 0)),
                    "retention_risk": str(state.get("retention_risk", "MEDIUM")),
                    "team_fit_score": str(state.get("team_fit_score", 0)),
                    "leadership_potential": str(
                        state.get("leadership_potential", "MEDIUM")
                    ),
                    "onboarding_difficulty": str(
                        state.get("onboarding_difficulty", "MODERATE")
                    ),
                    "promotion_potential": str(
                        state.get("promotion_potential", "MEDIUM")
                    ),
                },
            )
            data = json.loads(clean_json_str(raw))
            state["hiring_decision"] = data.get("hiringDecision", "Conditional Hire")
            state["hiring_confidence"] = data.get("hiringConfidence", 0)
            state["explanation"] = data.get("explanation", "")
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_persist(
        self, state: PredictiveHiringState
    ) -> PredictiveHiringState:
        if state.get("error"):
            return state
        logger.info("[PREDICTIVE] Stage 6 — Persisting results")
        try:
            predictive = {
                "successScore": state.get("success_score", 0),
                "retentionRisk": state.get("retention_risk", "MEDIUM"),
                "leadershipPotential": state.get("leadership_potential", "MEDIUM"),
                "teamFitScore": state.get("team_fit_score", 0),
                "onboardingDifficulty": state.get("onboarding_difficulty", "MODERATE"),
                "promotionPotential": state.get("promotion_potential", "MEDIUM"),
                "hiringConfidence": state.get("hiring_confidence", 0),
                "hiringDecision": state.get("hiring_decision", "Conditional Hire"),
                "explanation": state.get("explanation", ""),
                "analyzedAt": datetime.datetime.utcnow().isoformat(),
            }
            state["predictive_hiring"] = predictive

            collection = get_mongo_collection()
            await collection.update_one(
                {"_id": ObjectId(state["resume_id"])},
                {"$set": {"predictiveHiring": predictive}},
            )
            await self._emit_event(state["resume_id"], "PREDICTIVE_COMPLETED")
        except Exception as e:
            logger.error(f"[PREDICTIVE] Failed to persist: {e}")
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "PREDICTIVE_FAILED")
        return state

    # ---- public entry point ----

    async def run(self, resume_id: str) -> dict:
        initial_state: PredictiveHiringState = {
            "resume_id": resume_id,
            "resume_data": None,
            "ats_scores": None,
            "interview_evaluation": None,
            "fraud_analysis": None,
            "skill_gap_analysis": None,
            "candidate_ranking": None,
            "signal_profile": None,
            "success_score": None,
            "retention_risk": None,
            "team_fit_score": None,
            "leadership_potential": None,
            "onboarding_difficulty": None,
            "promotion_potential": None,
            "hiring_decision": None,
            "hiring_confidence": None,
            "explanation": None,
            "predictive_hiring": None,
            "error": None,
        }

        result = await self._graph.ainvoke(initial_state)

        if result.get("error"):
            return {"error": result["error"]}

        return result.get("predictive_hiring", {})
