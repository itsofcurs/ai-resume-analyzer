import json
import logging
from typing import TypedDict, Optional
from bson import ObjectId
import httpx
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
import datetime
import asyncio

from database import get_mongo_collection
from utils.retry_utils import ainvoke_with_retry
from utils.parser_utils import clean_json_str
from core.config import get_settings
from services.llm.llm_router import LLMRouter

logger = logging.getLogger(__name__)

class SkillGapState(TypedDict):
    resume_id: str
    resume_data: Optional[dict]
    interview_evaluation: Optional[dict]
    fraud_analysis: Optional[dict]
    strengths: Optional[list]
    weaknesses: Optional[list]
    skill_gaps: Optional[list]
    hiring_readiness: Optional[int]
    growth_potential: Optional[int]
    learning_agility: Optional[int]
    learning_plan: Optional[dict]
    projects: Optional[list]
    certifications: Optional[list]
    mock_interview_plan: Optional[list]
    final_assessment: Optional[str]
    skill_gap_analysis: Optional[dict]
    error: Optional[str]

# Prompts
STRENGTHS_WEAKNESSES_PROMPT = PromptTemplate.from_template(
    """Analyze the candidate's strengths and weaknesses based on their parsed resume, interview evaluation, and fraud analysis.
    
    Resume Data:
    {resume_json}
    
    Interview Evaluation:
    {interview_json}
    
    Fraud Analysis:
    {fraud_json}
    
    Return a JSON object with this exact schema:
    {{
        "strengths": ["list of strings"],
        "weaknesses": ["list of strings"]
    }}"""
)

SKILL_GAPS_PROMPT = PromptTemplate.from_template(
    """Identify the exact missing technologies and missing skills for this candidate.
    
    Resume Data:
    {resume_json}
    
    Interview Evaluation:
    {interview_json}
    
    Return a JSON object with this exact schema:
    {{
        "missingSkills": ["list of strings"],
        "missingTechnologies": ["list of strings"]
    }}"""
)

READINESS_POTENTIAL_PROMPT = PromptTemplate.from_template(
    """Calculate the Hiring Readiness Score (0-100), Growth Potential Score (0-100), and Learning Agility Score (0-100) based on the candidate's performance.
    
    Interview Evaluation:
    {interview_json}
    
    Fraud Analysis:
    {fraud_json}
    
    Return a JSON object with this exact schema:
    {{
        "hiringReadinessScore": 85,
        "growthPotentialScore": 90,
        "learningAgilityScore": 80,
        "estimatedJobReadiness": "string (e.g., 'Ready now', 'Ready in 30 days')",
        "finalAssessment": "string"
    }}"""
)

DEVELOPMENT_PLAN_PROMPT = PromptTemplate.from_template(
    """Create a 30/60/90 day learning plan, recommend projects, certifications, and a mock interview improvement plan based on the candidate's weaknesses and skill gaps.
    
    Weaknesses:
    {weaknesses}
    
    Missing Skills & Technologies:
    {skill_gaps}
    
    Return a JSON object with this exact schema:
    {{
        "thirtyDayPlan": ["list of strings"],
        "sixtyDayPlan": ["list of strings"],
        "ninetyDayPlan": ["list of strings"],
        "recommendedProjects": ["list of strings"],
        "recommendedCertifications": ["list of strings"],
        "mockInterviewPlan": ["list of strings"]
    }}"""
)

class SkillGapWorkflow:
    def __init__(self):
        graph = StateGraph(SkillGapState)
        
        graph.add_node("load_candidate", self._node_load_candidate)
        graph.add_node("analyze_strengths_weaknesses", self._node_analyze_strengths_weaknesses)
        graph.add_node("identify_skill_gaps", self._node_identify_skill_gaps)
        graph.add_node("calculate_readiness", self._node_calculate_readiness)
        graph.add_node("generate_development_plan", self._node_generate_development_plan)
        graph.add_node("persist_results", self._node_persist)
        
        graph.set_entry_point("load_candidate")
        graph.add_edge("load_candidate", "analyze_strengths_weaknesses")
        graph.add_edge("analyze_strengths_weaknesses", "identify_skill_gaps")
        graph.add_edge("identify_skill_gaps", "calculate_readiness")
        graph.add_edge("calculate_readiness", "generate_development_plan")
        graph.add_edge("generate_development_plan", "persist_results")
        graph.add_edge("persist_results", END)
        
        self._graph = graph.compile()

    async def _emit_event(self, resume_id: str, event_name: str):
        try:
            settings = get_settings()
            webhook_url = f"{settings.backend_url}/api/interview/webhook/event"
            async with httpx.AsyncClient() as client:
                await client.post(
                    webhook_url,
                    json={"id": resume_id, "event": event_name},
                    headers={"x-api-key": settings.internal_api_key},
                    timeout=5.0
                )
        except Exception as e:
            logger.warning(f"Failed to emit {event_name}: {e}")

    async def _node_load_candidate(self, state: SkillGapState) -> SkillGapState:
        logger.info("[SKILL_GAP] Stage 1 - Load Candidate")
        await self._emit_event(state["resume_id"], "SKILL_GAP_ANALYZING")
        try:
            collection = get_mongo_collection()
            resume = await collection.find_one({"_id": ObjectId(state["resume_id"])})
            if not resume:
                raise ValueError("Resume not found")
            
            state["resume_data"] = resume.get("parsedData", {})
            state["interview_evaluation"] = resume.get("interviewEvaluation", {})
            state["fraud_analysis"] = resume.get("fraudAnalysis", {})
        except Exception as e:
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "SKILL_GAP_FAILED")
        return state

    async def _node_analyze_strengths_weaknesses(self, state: SkillGapState) -> SkillGapState:
        if state.get("error"): return state
        logger.info("[SKILL_GAP] Stage 2 - Analyze Strengths & Weaknesses")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = STRENGTHS_WEAKNESSES_PROMPT | llm | StrOutputParser()
            raw_response = await ainvoke_with_retry(
                chain,
                {
                    "resume_json": json.dumps(state.get("resume_data", {})),
                    "interview_json": json.dumps(state.get("interview_evaluation", {})),
                    "fraud_json": json.dumps(state.get("fraud_analysis", {}))
                }
            )
            data = json.loads(clean_json_str(raw_response))
            state["strengths"] = data.get("strengths", [])
            state["weaknesses"] = data.get("weaknesses", [])
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_identify_skill_gaps(self, state: SkillGapState) -> SkillGapState:
        if state.get("error"): return state
        logger.info("[SKILL_GAP] Stage 3 - Identify Skill Gaps")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = SKILL_GAPS_PROMPT | llm | StrOutputParser()
            raw_response = await ainvoke_with_retry(
                chain,
                {
                    "resume_json": json.dumps(state.get("resume_data", {})),
                    "interview_json": json.dumps(state.get("interview_evaluation", {}))
                }
            )
            data = json.loads(clean_json_str(raw_response))
            state["skill_gaps"] = {
                "missingSkills": data.get("missingSkills", []),
                "missingTechnologies": data.get("missingTechnologies", [])
            }
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_calculate_readiness(self, state: SkillGapState) -> SkillGapState:
        if state.get("error"): return state
        logger.info("[SKILL_GAP] Stage 4 - Calculate Readiness & Potential")
        await self._emit_event(state["resume_id"], "READINESS_SCORING")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = READINESS_POTENTIAL_PROMPT | llm | StrOutputParser()
            raw_response = await ainvoke_with_retry(
                chain,
                {
                    "interview_json": json.dumps(state.get("interview_evaluation", {})),
                    "fraud_json": json.dumps(state.get("fraud_analysis", {}))
                }
            )
            data = json.loads(clean_json_str(raw_response))
            state["hiring_readiness"] = data.get("hiringReadinessScore", 0)
            state["growth_potential"] = data.get("growthPotentialScore", 0)
            state["learning_agility"] = data.get("learningAgilityScore", 0)
            state["final_assessment"] = data.get("finalAssessment", "")
            # store estimated readiness too
            state["skill_gap_analysis"] = {"estimatedJobReadiness": data.get("estimatedJobReadiness", "")}
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_generate_development_plan(self, state: SkillGapState) -> SkillGapState:
        if state.get("error"): return state
        logger.info("[SKILL_GAP] Stage 5 - Generate Development Plan")
        await self._emit_event(state["resume_id"], "LEARNING_PLAN_GENERATING")
        try:
            llm = LLMRouter.get_llm("interview")
            chain = DEVELOPMENT_PLAN_PROMPT | llm | StrOutputParser()
            raw_response = await ainvoke_with_retry(
                chain,
                {
                    "weaknesses": json.dumps(state.get("weaknesses", [])),
                    "skill_gaps": json.dumps(state.get("skill_gaps", {}))
                }
            )
            data = json.loads(clean_json_str(raw_response))
            
            # Combine all data into the final skillGapAnalysis object
            sg = state.get("skill_gap_analysis", {})
            sg.update({
                "hiringReadinessScore": state["hiring_readiness"],
                "growthPotentialScore": state["growth_potential"],
                "learningAgilityScore": state["learning_agility"],
                "strengths": state.get("strengths", []),
                "weaknesses": state.get("weaknesses", []),
                "missingSkills": state.get("skill_gaps", {}).get("missingSkills", []),
                "missingTechnologies": state.get("skill_gaps", {}).get("missingTechnologies", []),
                "thirtyDayPlan": data.get("thirtyDayPlan", []),
                "sixtyDayPlan": data.get("sixtyDayPlan", []),
                "ninetyDayPlan": data.get("ninetyDayPlan", []),
                "recommendedProjects": data.get("recommendedProjects", []),
                "recommendedCertifications": data.get("recommendedCertifications", []),
                "mockInterviewPlan": data.get("mockInterviewPlan", []),
                "finalAssessment": state.get("final_assessment", ""),
                "analyzedAt": datetime.datetime.utcnow().isoformat()
            })
            state["skill_gap_analysis"] = sg
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_persist(self, state: SkillGapState) -> SkillGapState:
        if state.get("error"): return state
        logger.info("[SKILL_GAP] Stage 6 - Persist Results")
        try:
            collection = get_mongo_collection()
            await collection.update_one(
                {"_id": ObjectId(state["resume_id"])},
                {"$set": {"skillGapAnalysis": state["skill_gap_analysis"]}}
            )
            await self._emit_event(state["resume_id"], "SKILL_GAP_COMPLETED")
        except Exception as e:
            logger.error(f"[SKILL_GAP] Failed to persist: {e}")
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "SKILL_GAP_FAILED")
        return state

    async def run(self, resume_id: str) -> dict:
        initial_state: SkillGapState = {
            "resume_id": resume_id,
            "resume_data": None,
            "interview_evaluation": None,
            "fraud_analysis": None,
            "strengths": None,
            "weaknesses": None,
            "skill_gaps": None,
            "hiring_readiness": None,
            "growth_potential": None,
            "learning_agility": None,
            "learning_plan": None,
            "projects": None,
            "certifications": None,
            "mock_interview_plan": None,
            "final_assessment": None,
            "skill_gap_analysis": None,
            "error": None
        }
        
        result_state = await self._graph.ainvoke(initial_state)
        
        if result_state.get("error"):
            return {"error": result_state["error"]}
            
        return result_state["skill_gap_analysis"]
