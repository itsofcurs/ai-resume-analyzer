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


class SkillGraphState(TypedDict):
    resume_id: str

    parsed_resume: Optional[dict]
    ats_scores: Optional[dict]
    interview_evaluation: Optional[dict]
    success_prediction: Optional[dict]
    authenticity_analysis: Optional[dict]

    technical_skills: Optional[list]
    soft_skills: Optional[list]
    strengths: Optional[list]
    weaknesses: Optional[list]

    overall_technical_score: Optional[int]
    overall_soft_skill_score: Optional[int]

    skill_clusters: Optional[list]
    skill_relationships: Optional[list]
    competency_level: Optional[dict]

    skill_graph: Optional[dict]
    error: Optional[str]


TECHNICAL_SKILLS_PROMPT = PromptTemplate.from_template(
    """Analyze the following candidate data to extract their core Technical Skills.
    Look for programming languages, frameworks, cloud platforms, tools, and databases.
    Provide a score (0-100) indicating their proficiency based on the evidence.
    Provide a confidence score (0-100) indicating how sure you are based on the amount of evidence.
    Provide an evidenceCount (integer) representing how many times the skill was demonstrated or mentioned.
    
    Resume Data: {resume_data}
    Interview Data: {interview_data}
    ATS Scores: {ats_data}
    
    Return ONLY valid JSON in this exact format:
    {{
        "technicalSkills": [
            {{ "skill": "React", "score": 85, "confidence": 90, "evidenceCount": 4 }}
        ]
    }}"""
)

SOFT_SKILLS_PROMPT = PromptTemplate.from_template(
    """Analyze the following candidate data to extract their Soft Skills.
    Focus on Communication, Leadership, Problem Solving, Learning Agility, Collaboration, Adaptability, Critical Thinking, and Ownership.
    Provide a score (0-100) indicating their proficiency based on the evidence.
    Provide a confidence score (0-100).
    Provide an evidenceCount (integer).
    
    Resume Data: {resume_data}
    Interview Data: {interview_data}
    Success Prediction: {success_data}
    
    Return ONLY valid JSON in this exact format:
    {{
        "softSkills": [
            {{ "skill": "Leadership", "score": 75, "confidence": 80, "evidenceCount": 2 }}
        ]
    }}"""
)

STRENGTHS_WEAKNESSES_PROMPT = PromptTemplate.from_template(
    """Based on the extracted skills and interview evidence, identify the candidate's top strengths and weaknesses.
    
    Technical Skills: {technical}
    Soft Skills: {soft}
    Authenticity Risk: {authenticity}
    
    Return ONLY valid JSON in this exact format:
    {{
        "strengths": ["System Architecture", "React Performance"],
        "weaknesses": ["Testing", "Leadership", "AWS"]
    }}"""
)

CLUSTERS_COMPETENCIES_PROMPT = PromptTemplate.from_template(
    """Analyze the following extracted technical and soft skills.
    
    Technical Skills: {technical}
    Soft Skills: {soft}
    
    Perform three tasks:
    1. Group the technical skills into high-level 'skillClusters' (e.g., Frontend, Backend, DevOps, Data Engineering, AI/ML, Cloud). Calculate an average score for each cluster.
    2. Identify 'skillRelationships' between skills (e.g., React requires JavaScript). Source and target must be exact skill names.
    3. Determine the 'competencyLevel' (Beginner, Intermediate, Advanced, Expert) for four key areas: technical, communication, leadership, problemSolving based on the scores.

    Return ONLY valid JSON in this exact format:
    {{
        "skillClusters": [
            {{ "clusterName": "Frontend", "skills": ["React", "JavaScript"], "score": 85 }}
        ],
        "skillRelationships": [
            {{ "source": "React", "target": "JavaScript", "relationship": "Requires", "confidence": 95 }}
        ],
        "competencyLevel": {{
            "technical": "Advanced",
            "communication": "Intermediate",
            "leadership": "Beginner",
            "problemSolving": "Expert"
        }}
    }}"""
)


class SkillGraphWorkflow:
    def __init__(self):
        builder = StateGraph(SkillGraphState)

        builder.add_node("load_candidate", self._node_load_candidate)
        builder.add_node("extract_technical", self._node_extract_technical)
        builder.add_node("extract_soft", self._node_extract_soft)
        builder.add_node(
            "identify_strengths_weaknesses", self._node_identify_strengths_weaknesses
        )
        builder.add_node("extract_clusters", self._node_extract_clusters)
        builder.add_node("aggregate_scores", self._node_aggregate_scores)
        builder.add_node("persist", self._node_persist)

        builder.set_entry_point("load_candidate")

        builder.add_conditional_edges(
            "load_candidate",
            lambda s: "extract_technical" if not s.get("error") else END,
            ["extract_technical", END],
        )
        builder.add_conditional_edges(
            "extract_technical",
            lambda s: "extract_soft" if not s.get("error") else END,
            ["extract_soft", END],
        )
        builder.add_conditional_edges(
            "extract_soft",
            lambda s: "identify_strengths_weaknesses" if not s.get("error") else END,
            ["identify_strengths_weaknesses", END],
        )
        builder.add_conditional_edges(
            "identify_strengths_weaknesses",
            lambda s: "extract_clusters" if not s.get("error") else END,
            ["extract_clusters", END],
        )
        builder.add_conditional_edges(
            "extract_clusters",
            lambda s: "aggregate_scores" if not s.get("error") else END,
            ["aggregate_scores", END],
        )
        builder.add_conditional_edges(
            "aggregate_scores",
            lambda s: "persist" if not s.get("error") else END,
            ["persist", END],
        )
        builder.add_edge("persist", END)

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
            logger.warning(f"[SKILLGRAPH] Failed to emit {event_name}: {exc}")

    async def _node_load_candidate(self, state: SkillGraphState) -> SkillGraphState:
        logger.info(f"[SKILLGRAPH] Stage 1 - Loading candidate {state['resume_id']}")
        await self._emit_event(state["resume_id"], "SKILL_GRAPH_GENERATING")
        try:
            if state["resume_id"] == "test_resume":
                state["parsed_resume"] = {}
                state["ats_scores"] = {}
                state["interview_evaluation"] = {}
                state["success_prediction"] = {}
                state["authenticity_analysis"] = {}
                return state

            collection = get_mongo_collection()
            resume = await collection.find_one({"_id": ObjectId(state["resume_id"])})
            if not resume:
                state["error"] = "Resume not found"
                await self._emit_event(state["resume_id"], "SKILL_GRAPH_FAILED")
                return state

            state["parsed_resume"] = resume.get("parsedData", {})
            state["ats_scores"] = resume.get("atsScores", {})
            state["interview_evaluation"] = resume.get("interviewEvaluation", {})
            state["success_prediction"] = resume.get("successPrediction", {})
            state["authenticity_analysis"] = resume.get("answerAuthenticity", {})
        except Exception as e:
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "SKILL_GRAPH_FAILED")
        return state

    async def _node_extract_technical(self, state: SkillGraphState) -> SkillGraphState:
        if state.get("error"):
            return state
        logger.info("[SKILLGRAPH] Stage 2 - Extracting Technical Skills")
        try:
            llm = LLMRouter.get_llm("extraction")
            chain = TECHNICAL_SKILLS_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(
                chain,
                {
                    "resume_data": json.dumps(state.get("parsed_resume", {})),
                    "interview_data": json.dumps(state.get("interview_evaluation", {})),
                    "ats_data": json.dumps(state.get("ats_scores", {})),
                },
            )
            data = json.loads(clean_json_str(raw))
            state["technical_skills"] = data.get("technicalSkills", [])
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_extract_soft(self, state: SkillGraphState) -> SkillGraphState:
        if state.get("error"):
            return state
        logger.info("[SKILLGRAPH] Stage 3 - Extracting Soft Skills")
        try:
            llm = LLMRouter.get_llm("extraction")
            chain = SOFT_SKILLS_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(
                chain,
                {
                    "resume_data": json.dumps(state.get("parsed_resume", {})),
                    "interview_data": json.dumps(state.get("interview_evaluation", {})),
                    "success_data": json.dumps(state.get("success_prediction", {})),
                },
            )
            data = json.loads(clean_json_str(raw))
            state["soft_skills"] = data.get("softSkills", [])
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_identify_strengths_weaknesses(
        self, state: SkillGraphState
    ) -> SkillGraphState:
        if state.get("error"):
            return state
        logger.info("[SKILLGRAPH] Stage 4 - Identifying Strengths & Weaknesses")
        try:
            llm = LLMRouter.get_llm("extraction")
            chain = STRENGTHS_WEAKNESSES_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(
                chain,
                {
                    "technical": json.dumps(state.get("technical_skills", [])),
                    "soft": json.dumps(state.get("soft_skills", [])),
                    "authenticity": json.dumps(state.get("authenticity_analysis", {})),
                },
            )
            data = json.loads(clean_json_str(raw))
            state["strengths"] = data.get("strengths", [])
            state["weaknesses"] = data.get("weaknesses", [])
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_extract_clusters(self, state: SkillGraphState) -> SkillGraphState:
        if state.get("error"):
            return state
        logger.info("[SKILLGRAPH] Stage 4b - Extracting Clusters & Competencies")
        try:
            llm = LLMRouter.get_llm("extraction")
            chain = CLUSTERS_COMPETENCIES_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(
                chain,
                {
                    "technical": json.dumps(state.get("technical_skills", [])),
                    "soft": json.dumps(state.get("soft_skills", [])),
                },
            )
            data = json.loads(clean_json_str(raw))
            state["skill_clusters"] = data.get("skillClusters", [])
            state["skill_relationships"] = data.get("skillRelationships", [])
            state["competency_level"] = data.get("competencyLevel", {})
        except Exception as e:
            logger.error(f"[SKILLGRAPH] Cluster extraction error: {e}")
            # Non-fatal error for this new feature
            state["skill_clusters"] = []
            state["skill_relationships"] = []
            state["competency_level"] = {
                "technical": "Intermediate",
                "communication": "Intermediate",
                "leadership": "Intermediate",
                "problemSolving": "Intermediate",
            }
        return state

    async def _node_aggregate_scores(self, state: SkillGraphState) -> SkillGraphState:
        if state.get("error"):
            return state
        logger.info("[SKILLGRAPH] Stage 5 - Aggregating Scores")

        tech = state.get("technical_skills", [])
        soft = state.get("soft_skills", [])

        tech_avg = sum([t.get("score", 0) for t in tech]) / len(tech) if tech else 0
        soft_avg = sum([s.get("score", 0) for s in soft]) / len(soft) if soft else 0

        state["overall_technical_score"] = int(tech_avg)
        state["overall_soft_skill_score"] = int(soft_avg)
        return state

    async def _node_persist(self, state: SkillGraphState) -> SkillGraphState:
        if state.get("error"):
            return state
        if state["resume_id"] == "test_resume":
            state["skill_graph"] = {
                "technicalSkills": state.get("technical_skills"),
                "softSkills": state.get("soft_skills"),
                "strengths": state.get("strengths"),
                "weaknesses": state.get("weaknesses"),
                "skillClusters": state.get("skill_clusters", []),
                "skillRelationships": state.get("skill_relationships", []),
                "competencyLevel": state.get("competency_level", {}),
                "overallTechnicalScore": state.get("overall_technical_score"),
                "overallSoftSkillScore": state.get("overall_soft_skill_score"),
                "generatedAt": datetime.datetime.utcnow().isoformat(),
            }
            return state

        logger.info("[SKILLGRAPH] Stage 6 - Persist")
        try:
            doc = {
                "technicalSkills": state.get("technical_skills", []),
                "softSkills": state.get("soft_skills", []),
                "strengths": state.get("strengths", []),
                "weaknesses": state.get("weaknesses", []),
                "skillClusters": state.get("skill_clusters", []),
                "skillRelationships": state.get("skill_relationships", []),
                "competencyLevel": state.get("competency_level", {}),
                "overallTechnicalScore": state.get("overall_technical_score", 0),
                "overallSoftSkillScore": state.get("overall_soft_skill_score", 0),
                "generatedAt": datetime.datetime.utcnow().isoformat(),
            }
            state["skill_graph"] = doc

            collection = get_mongo_collection()
            await collection.update_one(
                {"_id": ObjectId(state["resume_id"])}, {"$set": {"skillGraph": doc}}
            )
            await self._emit_event(state["resume_id"], "SKILL_GRAPH_COMPLETED")
        except Exception as e:
            logger.error(f"[SKILLGRAPH] Failed to persist: {e}")
            state["error"] = str(e)
            await self._emit_event(state["resume_id"], "SKILL_GRAPH_FAILED")
        return state

    async def run(self, resume_id: str) -> dict:
        initial_state: SkillGraphState = {
            "resume_id": resume_id,
            "parsed_resume": None,
            "ats_scores": None,
            "interview_evaluation": None,
            "success_prediction": None,
            "authenticity_analysis": None,
            "technical_skills": None,
            "soft_skills": None,
            "strengths": None,
            "weaknesses": None,
            "overall_technical_score": None,
            "overall_soft_skill_score": None,
            "skill_clusters": None,
            "skill_relationships": None,
            "competency_level": None,
            "skill_graph": None,
            "error": None,
        }

        result = await self._graph.ainvoke(initial_state)

        if result.get("error"):
            return {"error": result["error"]}

        return result.get("skill_graph", {})
