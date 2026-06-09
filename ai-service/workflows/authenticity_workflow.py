import json
import logging
import datetime
from typing import TypedDict, Optional, List

from bson import ObjectId
import httpx
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import StateGraph, END

from database import get_mongo_collection
from utils.retry_utils import ainvoke_with_retry
from utils.parser_utils import clean_json_str
from core.config import get_settings
from services.llm.llm_router import LLMRouter

logger = logging.getLogger(__name__)

class AuthenticityState(TypedDict):
    resume_id: str
    parsed_resume: Optional[dict]
    interview_evaluation: Optional[dict]
    interview_answers: Optional[list]
    interview_questions: Optional[list]
    
    copy_paste_risk: Optional[str]
    ai_generated_probability: Optional[int]
    behavioral_consistency: Optional[int]
    plagiarism_similarity: Optional[int]
    
    authenticity_score: Optional[int]
    suspicious_answers: Optional[List[str]]
    flagged_questions: Optional[List[str]]
    recruiter_alert: Optional[str]
    final_assessment: Optional[str]
    
    answer_authenticity: Optional[dict]
    error: Optional[str]

# Prompts
COPY_PASTE_PROMPT = PromptTemplate.from_template(
    """Analyze the candidate's interview answers for copy-paste patterns.
    Look for extremely long answers, unnatural template repetition, or sudden spikes in complexity.
    
    Answers: {answers_json}
    
    Return ONLY a valid JSON object:
    {{
        "copyPasteRisk": "LOW" | "MEDIUM" | "HIGH"
    }}"""
)

AI_GENERATED_PROMPT = PromptTemplate.from_template(
    """Analyze the candidate's interview answers for AI-generated patterns.
    Look for generic language, excessive structuring (e.g., 'Firstly, Secondly, In conclusion'),
    buzzword density, and a lack of personal examples or specific project references.
    
    Answers: {answers_json}
    
    Return ONLY a valid JSON object:
    {{
        "aiGeneratedProbability": <number 0-100>
    }}"""
)

CONSISTENCY_PROMPT = PromptTemplate.from_template(
    """Compare the candidate's resume claims against their interview answers.
    Do the answers demonstrate the depth of knowledge claimed in the resume?
    
    Resume: {resume_json}
    Answers: {answers_json}
    
    Return ONLY a valid JSON object:
    {{
        "behavioralConsistency": <number 0-100>
    }}"""
)

REPORT_PROMPT = PromptTemplate.from_template(
    """Generate an authenticity report based on the following metrics:
    Copy Paste Risk: {copy_paste_risk}
    AI Probability: {ai_prob}%
    Consistency: {consistency}%
    Similarity: {similarity}%
    Authenticity Score: {score}%
    
    Answers: {answers_json}
    
    Identify specific suspicious answers and flagged questions.
    
    Return ONLY a valid JSON object:
    {{
        "suspiciousAnswers": ["<answer snippet 1>", "<answer snippet 2>"],
        "flaggedQuestions": ["<question 1>", "<question 2>"],
        "recruiterAlert": "<Optional warning message. Null if genuine.>",
        "finalAssessment": "<1-2 sentences summarizing authenticity>"
    }}"""
)

class AuthenticityWorkflow:
    def __init__(self):
        builder = StateGraph(AuthenticityState)
        
        builder.add_node("load_candidate", self._node_load_candidate)
        builder.add_node("detect_copy_paste_patterns", self._node_copy_paste)
        builder.add_node("detect_ai_generated_patterns", self._node_ai_gen)
        builder.add_node("compare_resume_consistency", self._node_consistency)
        builder.add_node("similarity_analysis", self._node_similarity)
        builder.add_node("calculate_authenticity_score", self._node_calculate_score)
        builder.add_node("generate_report", self._node_generate_report)
        builder.add_node("persist", self._node_persist)
        
        builder.set_entry_point("load_candidate")
        
        builder.add_conditional_edges("load_candidate", lambda s: "detect_copy_paste_patterns" if not s.get("error") else END, ["detect_copy_paste_patterns", END])
        builder.add_conditional_edges("detect_copy_paste_patterns", lambda s: "detect_ai_generated_patterns" if not s.get("error") else END, ["detect_ai_generated_patterns", END])
        builder.add_conditional_edges("detect_ai_generated_patterns", lambda s: "compare_resume_consistency" if not s.get("error") else END, ["compare_resume_consistency", END])
        builder.add_conditional_edges("compare_resume_consistency", lambda s: "similarity_analysis" if not s.get("error") else END, ["similarity_analysis", END])
        builder.add_conditional_edges("similarity_analysis", lambda s: "calculate_authenticity_score" if not s.get("error") else END, ["calculate_authenticity_score", END])
        builder.add_conditional_edges("calculate_authenticity_score", lambda s: "generate_report" if not s.get("error") else END, ["generate_report", END])
        builder.add_conditional_edges("generate_report", lambda s: "persist" if not s.get("error") else END, ["persist", END])
        builder.add_edge("persist", END)
        
        self._graph = builder.compile()

    async def _emit_event(self, resume_id: str, event_name: str):
        try:
            settings = get_settings()
            if not settings.node_backend_url: return
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{settings.node_backend_url.rstrip('/')}/api/interview/webhook/event",
                    json={"id": resume_id, "event": event_name},
                    headers={"x-api-key": settings.internal_api_key or "default-internal-key"},
                    timeout=2.0,
                )
        except Exception as exc:
            logger.warning(f"[AUTHENTICITY] Failed to emit {event_name}: {exc}")

    async def _node_load_candidate(self, state: AuthenticityState) -> AuthenticityState:
        logger.info(f"[AUTHENTICITY] Stage 1 - Loading candidate {state['resume_id']}")
        await self._emit_event(state["resume_id"], "AUTHENTICITY_ANALYZING")
        try:
            collection = get_mongo_collection()
            resume = await collection.find_one({"_id": ObjectId(state["resume_id"])})
            if not resume:
                state["error"] = "Resume not found"
                await self._emit_event(state["resume_id"], "AUTHENTICITY_FAILED")
                return state

            state["parsed_resume"] = resume.get("parsedData", {})
            state["interview_evaluation"] = resume.get("interviewEvaluation", {})
            
            # Extract raw Q&A
            qa_list = state["interview_evaluation"].get("questionsAndAnswers", [])
            state["interview_questions"] = [qa.get("question") for qa in qa_list if qa.get("question")]
            state["interview_answers"] = [qa.get("answer") for qa in qa_list if qa.get("answer")]
            
            if not state["interview_answers"]:
                state["error"] = "No interview answers found to analyze"
                await self._emit_event(state["resume_id"], "AUTHENTICITY_FAILED")
                return state
                
        except Exception as e:
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "AUTHENTICITY_FAILED")
        return state

    async def _node_copy_paste(self, state: AuthenticityState) -> AuthenticityState:
        if state.get("error"): return state
        logger.info("[AUTHENTICITY] Stage 2 - Detecting Copy-Paste Patterns")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = COPY_PASTE_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(chain, {"answers_json": json.dumps(state["interview_answers"])})
            data = json.loads(clean_json_str(raw))
            state["copy_paste_risk"] = data.get("copyPasteRisk", "LOW")
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_ai_gen(self, state: AuthenticityState) -> AuthenticityState:
        if state.get("error"): return state
        logger.info("[AUTHENTICITY] Stage 3 - Detecting AI Patterns")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = AI_GENERATED_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(chain, {"answers_json": json.dumps(state["interview_answers"])})
            data = json.loads(clean_json_str(raw))
            state["ai_generated_probability"] = data.get("aiGeneratedProbability", 0)
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_consistency(self, state: AuthenticityState) -> AuthenticityState:
        if state.get("error"): return state
        logger.info("[AUTHENTICITY] Stage 4 - Comparing Resume Consistency")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = CONSISTENCY_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(chain, {
                "resume_json": json.dumps(state["parsed_resume"], default=str),
                "answers_json": json.dumps(state["interview_answers"])
            })
            data = json.loads(clean_json_str(raw))
            state["behavioral_consistency"] = data.get("behavioralConsistency", 100)
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_similarity(self, state: AuthenticityState) -> AuthenticityState:
        if state.get("error"): return state
        logger.info("[AUTHENTICITY] Stage 5 - Similarity Analysis")
        # In a full implementation, we would embed answers and query a vector DB.
        # Here we mock the plagiarism similarity as we do not permanently store raw candidate answers.
        state["plagiarism_similarity"] = 15 # baseline low plagiarism
        return state

    async def _node_calculate_score(self, state: AuthenticityState) -> AuthenticityState:
        if state.get("error"): return state
        logger.info("[AUTHENTICITY] Stage 6 - Calculating Authenticity Score")
        try:
            con = state.get("behavioral_consistency", 100)
            ai_prob = state.get("ai_generated_probability", 0)
            sim = state.get("plagiarism_similarity", 0)
            cp = state.get("copy_paste_risk", "LOW")
            
            cp_penalty = 0
            if cp == "HIGH": cp_penalty = 100
            elif cp == "MEDIUM": cp_penalty = 50
            
            # Weighted formula: 40% Consistency, 25% AI, 20% Similarity, 15% Copy-Paste
            # Actually we want score to be 100 if genuine.
            # Base 100
            # Consistency is 0-100 (100 is best).
            # AI prob is 0-100 (0 is best).
            # Sim is 0-100 (0 is best).
            # CP is 0-100 penalty (0 is best).
            
            score = (con * 0.40) + ((100 - ai_prob) * 0.25) + ((100 - sim) * 0.20) + ((100 - cp_penalty) * 0.15)
            state["authenticity_score"] = int(score)
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_generate_report(self, state: AuthenticityState) -> AuthenticityState:
        if state.get("error"): return state
        logger.info("[AUTHENTICITY] Stage 7 - Generating Report")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = REPORT_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(chain, {
                "copy_paste_risk": state["copy_paste_risk"],
                "ai_prob": state["ai_generated_probability"],
                "consistency": state["behavioral_consistency"],
                "similarity": state["plagiarism_similarity"],
                "score": state["authenticity_score"],
                "answers_json": json.dumps(state["interview_answers"])
            })
            data = json.loads(clean_json_str(raw))
            state["suspicious_answers"] = data.get("suspiciousAnswers", [])
            state["flagged_questions"] = data.get("flaggedQuestions", [])
            state["recruiter_alert"] = data.get("recruiterAlert")
            state["final_assessment"] = data.get("finalAssessment", "")
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_persist(self, state: AuthenticityState) -> AuthenticityState:
        if state.get("error"): return state
        logger.info("[AUTHENTICITY] Stage 8 - Persist Results")
        try:
            doc = {
                "authenticityScore": state.get("authenticity_score", 0),
                "aiGeneratedProbability": state.get("ai_generated_probability", 0),
                "plagiarismSimilarity": state.get("plagiarism_similarity", 0),
                "copyPasteRisk": state.get("copy_paste_risk", "LOW"),
                "behavioralConsistency": state.get("behavioral_consistency", 100),
                "confidenceLevel": 90, # default high confidence
                "suspiciousAnswers": state.get("suspicious_answers", []),
                "flaggedQuestions": state.get("flagged_questions", []),
                "recruiterAlert": state.get("recruiter_alert"),
                "finalAssessment": state.get("final_assessment", ""),
                "analyzedAt": datetime.datetime.utcnow().isoformat()
            }
            state["answer_authenticity"] = doc

            collection = get_mongo_collection()
            await collection.update_one(
                {"_id": ObjectId(state["resume_id"])},
                {"$set": {"answerAuthenticity": doc}}
            )
            await self._emit_event(state["resume_id"], "AUTHENTICITY_COMPLETED")
        except Exception as e:
            logger.error(f"[AUTHENTICITY] Failed to persist: {e}")
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "AUTHENTICITY_FAILED")
        return state

    async def run(self, resume_id: str) -> dict:
        initial_state: AuthenticityState = {
            "resume_id": resume_id,
            "parsed_resume": None,
            "interview_evaluation": None,
            "interview_answers": None,
            "interview_questions": None,
            "copy_paste_risk": None,
            "ai_generated_probability": None,
            "behavioral_consistency": None,
            "plagiarism_similarity": None,
            "authenticity_score": None,
            "suspicious_answers": None,
            "flagged_questions": None,
            "recruiter_alert": None,
            "final_assessment": None,
            "answer_authenticity": None,
            "error": None
        }

        result = await self._graph.ainvoke(initial_state)

        if result.get("error"):
            return {"error": result["error"]}

        return result.get("answer_authenticity", {})
