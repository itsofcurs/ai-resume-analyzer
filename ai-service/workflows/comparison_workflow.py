"""
workflows/comparison_workflow.py
--------------------------------
AI Candidate Comparison Engine using LangGraph.

Input: Candidate A ID, Candidate B ID
Output: Comparison Report (Structured JSON)
"""

import json
import logging
from typing import TypedDict, Optional

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
from bson import ObjectId

from database import get_mongo_collection
from services.gemini_service import GeminiService
from utils.parser_utils import clean_json_str

logger = logging.getLogger(__name__)

COMPARISON_PROMPT = PromptTemplate.from_template(
    """You are an expert AI Technical Recruiter.
    Compare the following two candidates based on their structured resume data and ATS scores.
    
    Candidate A Data:
    {candidate_a_json}
    
    Candidate B Data:
    {candidate_b_json}
    
    Provide a detailed comparison focusing on:
    1. ATS Score comparison
    2. Skill Match & Depth
    3. Education & Experience
    4. Final Recommendation (who is better and why)
    
    Return ONLY a valid JSON object matching this schema:
    {{
        "winner_id": "Candidate A ID or Candidate B ID",
        "ats_comparison": "string",
        "skill_comparison": "string",
        "experience_comparison": "string",
        "final_recommendation": "string"
    }}
    """
)

class ComparisonState(TypedDict):
    candidate_a_id: str
    candidate_b_id: str
    candidate_a_data: Optional[dict]
    candidate_b_data: Optional[dict]
    comparison_result: Optional[dict]
    error: Optional[str]

class ComparisonWorkflow:
    def __init__(self):
        graph = StateGraph(ComparisonState)

        graph.add_node("fetch_candidates", self._node_fetch_candidates)
        graph.add_node("generate_comparison", self._node_generate_comparison)
        graph.add_node("update_mongo", self._node_update_mongo)
        graph.add_node("handle_failure", self._node_handle_failure)

        graph.set_entry_point("fetch_candidates")
        
        graph.add_conditional_edges(
            "fetch_candidates",
            lambda state: "handle_failure" if state.get("error") else "generate_comparison"
        )
        
        graph.add_conditional_edges(
            "generate_comparison",
            lambda state: "handle_failure" if state.get("error") else "update_mongo"
        )
        
        graph.add_conditional_edges(
            "update_mongo",
            lambda state: "handle_failure" if state.get("error") else END
        )
        
        graph.add_edge("handle_failure", END)

        self._graph = graph.compile()

    async def _node_fetch_candidates(self, state: ComparisonState) -> ComparisonState:
        logger.info(f"[COMPARE] Stage 1 - Fetching candidates {state['candidate_a_id']} vs {state['candidate_b_id']}")
        try:
            collection = get_mongo_collection()
            cand_a = await collection.find_one({"_id": ObjectId(state['candidate_a_id'])})
            cand_b = await collection.find_one({"_id": ObjectId(state['candidate_b_id'])})
            
            if not cand_a or not cand_b:
                state["error"] = "One or both candidates not found in MongoDB."
                return state
                
            state["candidate_a_data"] = {
                "id": str(cand_a["_id"]),
                "name": cand_a.get("candidateName", "Unknown"),
                "parsed": cand_a.get("parsedData", {}),
                "ats": cand_a.get("atsScores", {})
            }
            state["candidate_b_data"] = {
                "id": str(cand_b["_id"]),
                "name": cand_b.get("candidateName", "Unknown"),
                "parsed": cand_b.get("parsedData", {}),
                "ats": cand_b.get("atsScores", {})
            }
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_generate_comparison(self, state: ComparisonState) -> ComparisonState:
        logger.info("[COMPARE] Stage 2 - Generating AI Comparison")
        try:
            llm = GeminiService.get_instance().get_llm()
            chain = COMPARISON_PROMPT | llm | StrOutputParser()
            
            raw_response = await chain.ainvoke({
                "candidate_a_json": json.dumps(state["candidate_a_data"], ensure_ascii=False),
                "candidate_b_json": json.dumps(state["candidate_b_data"], ensure_ascii=False)
            })
            
            cleaned = clean_json_str(raw_response)
            state["comparison_result"] = json.loads(cleaned)
        except Exception as e:
            logger.error(f"[COMPARE] Generation failed: {e}")
            state["error"] = str(e)
        return state

    async def _node_update_mongo(self, state: ComparisonState) -> ComparisonState:
        logger.info("[COMPARE] Stage 3 - Updating MongoDB history")
        try:
            collection = get_mongo_collection()
            comparison_doc = {
                "compared_with": state["candidate_b_id"],
                "result": state["comparison_result"]
            }
            # Append to candidate A's comparisonHistory
            await collection.update_one(
                {"_id": ObjectId(state["candidate_a_id"])},
                {"$push": {"comparisonHistory": comparison_doc}}
            )
            # Append inverse to candidate B
            inverse_doc = {
                "compared_with": state["candidate_a_id"],
                "result": state["comparison_result"]
            }
            await collection.update_one(
                {"_id": ObjectId(state["candidate_b_id"])},
                {"$push": {"comparisonHistory": inverse_doc}}
            )
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_handle_failure(self, state: ComparisonState) -> ComparisonState:
        logger.error(f"[COMPARE] Failed: {state.get('error')}")
        return state

    async def run(self, candidate_a_id: str, candidate_b_id: str) -> dict:
        state = {
            "candidate_a_id": candidate_a_id,
            "candidate_b_id": candidate_b_id,
            "candidate_a_data": None,
            "candidate_b_data": None,
            "comparison_result": None,
            "error": None
        }
        final_state = await self._graph.ainvoke(state)
        if final_state.get("error"):
            return {"error": final_state["error"]}
        
        return {"comparison": final_state.get("comparison_result")}
