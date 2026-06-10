"""
workflows/live_interview_workflow.py
------------------------------------
AI Interview Copilot Live Analysis.
Listens to live interview text, evaluates the candidate's answer, and suggests follow-up questions.
"""

import logging
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END
from bson import ObjectId

from database import get_mongo_collection
from services.llm.llm_router import LLMRouter
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from utils.parser_utils import clean_json_str
import json

logger = logging.getLogger(__name__)

class LiveInterviewState(TypedDict):
    candidate_id: str
    organization_id: str
    context: str
    current_question: str
    candidate_answer: str
    evaluation: Optional[dict]
    error: Optional[str]

class LiveInterviewWorkflow:
    def __init__(self):
        graph = StateGraph(LiveInterviewState)

        graph.add_node("analyze_answer", self._node_analyze_answer)
        graph.add_node("handle_failure", self._node_handle_failure)

        graph.set_entry_point("analyze_answer")
        
        graph.add_conditional_edges("analyze_answer", lambda s: "handle_failure" if s.get("error") else END)
        graph.add_edge("handle_failure", END)

        self._graph = graph.compile()

    async def _node_analyze_answer(self, state: LiveInterviewState) -> LiveInterviewState:
        try:
            llm = LLMRouter.get_llm("copilot")
            prompt = PromptTemplate.from_template(
                """You are an AI Interview Copilot listening to a live interview.
                
                Interview Context (e.g., job role, stage): {context}
                Current Question Asked: {current_question}
                Candidate's Answer: {candidate_answer}
                
                Tasks:
                1. Evaluate the candidate's answer (Score 1-10).
                2. Provide a brief critique (what was good, what was missing).
                3. Suggest 2 dynamic follow-up questions to drill down on weaknesses or interesting points.
                
                Return ONLY valid JSON:
                {{
                    "score": 8,
                    "critique": "string",
                    "follow_up_questions": ["q1", "q2"],
                    "red_flags": ["flag1"]
                }}"""
            )
            
            chain = prompt | llm | StrOutputParser()
            res = await chain.ainvoke({
                "context": state.get("context", "General technical interview"),
                "current_question": state["current_question"],
                "candidate_answer": state["candidate_answer"]
            })
            parsed = json.loads(clean_json_str(res))
            state["evaluation"] = parsed
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_handle_failure(self, state: LiveInterviewState) -> LiveInterviewState:
        logger.error(f"[LIVE INTERVIEW] Failed: {state.get('error')}")
        return state

    async def run(self, candidate_id: str, organization_id: str, context: str, current_question: str, candidate_answer: str) -> dict:
        state = {
            "candidate_id": candidate_id,
            "organization_id": organization_id,
            "context": context,
            "current_question": current_question,
            "candidate_answer": candidate_answer,
            "evaluation": None,
            "error": None
        }
        final_state = await self._graph.ainvoke(state)
        if final_state.get("error"):
            return {"error": final_state["error"]}
        return {"live_analysis": final_state["evaluation"]}
