import json
import logging
from typing import TypedDict, Optional
from bson import ObjectId
import httpx
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import StateGraph, END

from database import get_mongo_collection
from schemas.interview_schema import (
    InterviewQuestionsSchema,
    TechnicalQuestion,
    ProjectQuestion,
    BehavioralQuestion,
    FollowUpQuestion,
)
from services.llm.llm_router import LLMRouter
from utils.retry_utils import ainvoke_with_retry
from utils.parser_utils import clean_json_str
from core.config import get_settings

logger = logging.getLogger(__name__)

class InterviewState(TypedDict):
    resume_id: str
    parsed_data: Optional[dict]
    technical_questions: list[TechnicalQuestion]
    project_questions: list[ProjectQuestion]
    behavioral_questions: list[BehavioralQuestion]
    follow_up_questions: list[FollowUpQuestion]
    error: Optional[str]

TECHNICAL_PROMPT = PromptTemplate.from_template(
    """You are an expert technical interviewer. Based on the candidate's skills and experience, generate 3-5 technical interview questions.
    Ensure questions vary in difficulty (Easy, Medium, Hard).
    
    Candidate Data:
    {resume_json}
    
    Return ONLY a JSON array of objects with the following schema:
    [
        {{
            "question": "The question",
            "skill": "The skill being tested",
            "difficulty": "Easy|Medium|Hard"
        }}
    ]
    """
)

PROJECT_PROMPT = PromptTemplate.from_template(
    """You are an expert technical interviewer. Based on the candidate's projects and experience, generate 2-4 project-related interview questions.
    
    Candidate Data:
    {resume_json}
    
    Return ONLY a JSON array of objects with the following schema:
    [
        {{
            "question": "The question",
            "project": "The specific project or experience being referenced"
        }}
    ]
    """
)

BEHAVIORAL_PROMPT = PromptTemplate.from_template(
    """You are an expert recruiter. Based on the candidate's profile, generate 2-3 behavioral interview questions.
    Focus on leadership, teamwork, conflict resolution, or adaptability.
    
    Candidate Data:
    {resume_json}
    
    Return ONLY a JSON array of objects with the following schema:
    [
        {{
            "question": "The question"
        }}
    ]
    """
)

FOLLOWUP_PROMPT = PromptTemplate.from_template(
    """You are an expert interviewer. Review the technical, project, and behavioral questions already generated, and create 2-4 follow-up questions.
    Each follow-up question should probe deeper into the candidate's response to one of the parent questions.
    
    Existing Questions:
    {questions_json}
    
    Return ONLY a JSON array of objects with the following schema:
    [
        {{
            "question": "The follow-up question",
            "parentQuestion": "The exact original question this follows up on"
        }}
    ]
    """
)

class InterviewQuestionGraph:
    def __init__(self):
        graph = StateGraph(InterviewState)
        
        graph.add_node("load_candidate", self._node_load_candidate)
        graph.add_node("generate_technical", self._node_generate_technical)
        graph.add_node("generate_project", self._node_generate_project)
        graph.add_node("generate_behavioral", self._node_generate_behavioral)
        graph.add_node("generate_followups", self._node_generate_followups)
        graph.add_node("save_questions", self._node_save_questions)
        graph.add_node("handle_failure", self._node_handle_failure)
        
        graph.set_entry_point("load_candidate")
        
        graph.add_conditional_edges(
            "load_candidate",
            lambda state: "handle_failure" if state.get("error") else "generate_technical"
        )
        
        graph.add_conditional_edges(
            "generate_technical",
            lambda state: "handle_failure" if state.get("error") else "generate_project"
        )
        
        graph.add_conditional_edges(
            "generate_project",
            lambda state: "handle_failure" if state.get("error") else "generate_behavioral"
        )
        
        graph.add_conditional_edges(
            "generate_behavioral",
            lambda state: "handle_failure" if state.get("error") else "generate_followups"
        )
        
        graph.add_conditional_edges(
            "generate_followups",
            lambda state: "handle_failure" if state.get("error") else "save_questions"
        )
        
        graph.add_edge("save_questions", END)
        graph.add_edge("handle_failure", END)
        
        self._graph = graph.compile()

    async def _emit_event(self, resume_id: str, event_name: str):
        try:
            settings = get_settings()
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{settings.node_backend_url.rstrip('/')}/api/interview/webhook/event",
                    json={"id": resume_id, "event": event_name},
                    headers={"x-api-key": settings.internal_api_key or "default-internal-key"},
                    timeout=2.0
                )
        except Exception as exc:
            logger.warning(f"[INTERVIEW] Failed to send webhook for {event_name}: {exc}")

    async def _node_load_candidate(self, state: InterviewState) -> InterviewState:
        logger.info(f"[INTERVIEW] Stage 1 - Loading candidate {state['resume_id']}")
        try:
            await self._emit_event(state["resume_id"], "QUESTION_GENERATION_STARTED")
            collection = get_mongo_collection()
            resume = await collection.find_one({"_id": ObjectId(state["resume_id"])})
            if not resume:
                state["error"] = "Resume not found"
                return state
            
            state["parsed_data"] = resume.get("parsedData", {})
            if not state["parsed_data"]:
                state["error"] = "No parsed data available for candidate"
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _generate_section(self, prompt, resume_json: str, model_class):
        llm = LLMRouter.get_llm("interview")
        chain = prompt | llm | StrOutputParser()
        raw = await ainvoke_with_retry(chain, {"resume_json": resume_json})
        cleaned = clean_json_str(raw)
        data = json.loads(cleaned)
        return [model_class(**item) for item in data]

    async def _node_generate_technical(self, state: InterviewState) -> InterviewState:
        logger.info(f"[INTERVIEW] Stage 2 - Generating Technical Questions")
        try:
            resume_json = json.dumps(state["parsed_data"])
            state["technical_questions"] = await self._generate_section(TECHNICAL_PROMPT, resume_json, TechnicalQuestion)
        except Exception as e:
            logger.error(f"[INTERVIEW] Failed to generate technical questions: {e}")
            state["error"] = str(e)
        return state

    async def _node_generate_project(self, state: InterviewState) -> InterviewState:
        logger.info(f"[INTERVIEW] Stage 3 - Generating Project Questions")
        try:
            resume_json = json.dumps(state["parsed_data"])
            state["project_questions"] = await self._generate_section(PROJECT_PROMPT, resume_json, ProjectQuestion)
        except Exception as e:
            logger.error(f"[INTERVIEW] Failed to generate project questions: {e}")
            state["error"] = str(e)
        return state

    async def _node_generate_behavioral(self, state: InterviewState) -> InterviewState:
        logger.info(f"[INTERVIEW] Stage 4 - Generating Behavioral Questions")
        try:
            resume_json = json.dumps(state["parsed_data"])
            state["behavioral_questions"] = await self._generate_section(BEHAVIORAL_PROMPT, resume_json, BehavioralQuestion)
        except Exception as e:
            logger.error(f"[INTERVIEW] Failed to generate behavioral questions: {e}")
            state["error"] = str(e)
        return state

    async def _node_generate_followups(self, state: InterviewState) -> InterviewState:
        logger.info(f"[INTERVIEW] Stage 5 - Generating Follow-up Questions")
        try:
            all_questions = (
                [q.question for q in state["technical_questions"]] +
                [q.question for q in state["project_questions"]] +
                [q.question for q in state["behavioral_questions"]]
            )
            questions_json = json.dumps(all_questions)
            
            llm = LLMRouter.get_llm("interview")
            chain = FOLLOWUP_PROMPT | llm | StrOutputParser()
            raw = await ainvoke_with_retry(chain, {"questions_json": questions_json})
            cleaned = clean_json_str(raw)
            data = json.loads(cleaned)
            state["follow_up_questions"] = [FollowUpQuestion(**item) for item in data]
        except Exception as e:
            logger.error(f"[INTERVIEW] Failed to generate follow-up questions: {e}")
            state["error"] = str(e)
        return state

    async def _node_save_questions(self, state: InterviewState) -> InterviewState:
        logger.info(f"[INTERVIEW] Stage 6 - Saving Questions")
        try:
            schema = InterviewQuestionsSchema(
                technicalQuestions=state["technical_questions"],
                projectQuestions=state["project_questions"],
                behavioralQuestions=state["behavioral_questions"],
                followUpQuestions=state["follow_up_questions"],
            )
            
            collection = get_mongo_collection()
            await collection.update_one(
                {"_id": ObjectId(state["resume_id"])},
                {"$set": {"interviewQuestions": schema.model_dump()}}
            )
            
            await self._emit_event(state["resume_id"], "QUESTION_GENERATION_COMPLETED")
        except Exception as e:
            logger.error(f"[INTERVIEW] Failed to save questions: {e}")
            state["error"] = str(e)
            await self._node_handle_failure(state)
        return state

    async def _node_handle_failure(self, state: InterviewState) -> InterviewState:
        logger.error(f"[INTERVIEW] Pipeline failed: {state.get('error')}")
        await self._emit_event(state["resume_id"], "QUESTION_GENERATION_FAILED")
        return state

    async def run(self, resume_id: str) -> None:
        initial_state: InterviewState = {
            "resume_id": resume_id,
            "parsed_data": None,
            "technical_questions": [],
            "project_questions": [],
            "behavioral_questions": [],
            "follow_up_questions": [],
            "error": None
        }
        await self._graph.ainvoke(initial_state)
