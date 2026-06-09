import json
import logging
import datetime
from typing import TypedDict, Optional, List, Dict, Any
import os
import requests

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
from bson import ObjectId

from database import get_mongo_collection, vector_search
from embeddings import generate_query_embedding
from services.llm.llm_router import LLMRouter
from utils.parser_utils import clean_json_str
from utils.security_utils import sanitize_user_prompt

logger = logging.getLogger(__name__)

def emit_socket_event(event_name: str, payload: dict):
    node_url = os.environ.get("NODE_SERVICE_URL", "http://localhost:5000")
    try:
        requests.post(f"{node_url}/api/copilot/emit", json={"event": event_name, "payload": payload}, timeout=2)
    except:
        pass

class RecruiterCopilotState(TypedDict):
    organization_id: str
    recruiter_query: str
    intent: Optional[str]
    tool_results: Dict[str, Any]
    reasoning: Optional[Dict[str, Any]]
    final_response: Optional[dict]
    error: Optional[str]

INTENT_PROMPT = PromptTemplate.from_template(
    """You are an elite Autonomous Recruiter Copilot.
    Classify the recruiter's query into ONE of the following precise intents:
    - SEARCH_CANDIDATES
    - COMPARE_CANDIDATES
    - EXPLAIN_ATS
    - EXPLAIN_FRAUD
    - EXPLAIN_SUCCESS
    - FIND_HIDDEN_TALENT
    - GENERATE_INTERVIEW_PLAN
    - HIRING_RECOMMENDATION
    - ANALYTICS_QUERY
    - VOICE_VIDEO_ANALYTICS
    - GENERAL_QA

    User Query: {query}

    Return ONLY a valid JSON:
    {{
        "intent": "string"
    }}
    """
)

REASONING_PROMPT = PromptTemplate.from_template(
    """You are the deep reasoning layer of the Autonomous Recruiter Copilot.
    Given the recruiter's query and the raw data retrieved from tools, analyze the information deeply.
    
    Query: {query}
    Intent: {intent}
    Data: {tool_results}
    
    You must extract and explicitly state:
    1. Why a candidate was selected (or rejected).
    2. Any hidden strengths found.
    3. Any identified risks (fraud, lack of skills, cultural mismatch).
    4. Recommended next action.
    
    Return ONLY a valid JSON:
    {{
        "selection_rationale": "Explanation...",
        "hidden_strengths": ["strength1", "strength2"],
        "identified_risks": ["risk1", "risk2"],
        "recommended_next_action": "Action to take"
    }}
    """
)

RESPONSE_PROMPT = PromptTemplate.from_template(
    """You are the final generation node of the Autonomous Recruiter Copilot.
    Take the reasoning data and format a polished, highly professional response for the recruiter.
    
    Query: {query}
    Reasoning: {reasoning}
    Raw Data Summary: {tool_results}
    
    Return ONLY a valid JSON:
    {{
        "summary": "Conversational, executive summary answering the query",
        "evidence": ["Data point 1", "Data point 2"],
        "recommended_action": "Clear next step",
        "confidence": 95,
        "best_candidate": "Candidate Name if applicable, else null"
    }}
    """
)

class AutonomousRecruiterWorkflow:
    def __init__(self):
        graph = StateGraph(RecruiterCopilotState)

        graph.add_node("detect_intent", self._node_detect_intent)
        graph.add_node("route_tool", self._node_route_tool)
        graph.add_node("reasoning_layer", self._node_reasoning_layer)
        graph.add_node("generate_recruiter_response", self._node_generate_response)

        graph.set_entry_point("detect_intent")
        graph.add_edge("detect_intent", "route_tool")
        graph.add_edge("route_tool", "reasoning_layer")
        graph.add_edge("reasoning_layer", "generate_recruiter_response")
        graph.add_edge("generate_recruiter_response", END)

        self._graph = graph.compile()

    async def _node_detect_intent(self, state: RecruiterCopilotState) -> RecruiterCopilotState:
        emit_socket_event("COPILOT_TOOL_RUNNING", {"tool": "detect_intent"})
        try:
            llm = LLMRouter.get_llm("copilot")
            chain = INTENT_PROMPT | llm | StrOutputParser()
            raw = await chain.ainvoke({"query": state["recruiter_query"]})
            data = json.loads(clean_json_str(raw))
            state["intent"] = data.get("intent", "GENERAL_QA")
        except Exception as e:
            logger.error(f"Intent detection failed: {e}")
            state["intent"] = "GENERAL_QA"
        emit_socket_event("COPILOT_TOOL_COMPLETED", {"tool": "detect_intent"})
        return state

    async def _node_route_tool(self, state: RecruiterCopilotState) -> RecruiterCopilotState:
        intent = state["intent"]
        query = state["recruiter_query"]
        org_id = state["organization_id"]
        
        emit_socket_event("COPILOT_TOOL_RUNNING", {"tool": f"route_{intent.lower()}"})
        
        collection = get_mongo_collection()
        match_query = {"organizationId": org_id}
        results = {}

        try:
            if intent == "SEARCH_CANDIDATES":
                vector = generate_query_embedding(query)
                matches = await vector_search(vector, top_k=5)
                # Filter by org_id in application logic if vector db lacks it
                filtered = [m for m in matches if str(m.get("organizationId", org_id)) == str(org_id)]
                results["candidates"] = filtered
            
            elif intent == "COMPARE_CANDIDATES":
                # For simplicity, extract names using a quick LLM call or regex, then fetch
                results["notice"] = "Comparison data fetched via vector search."
                vector = generate_query_embedding(query)
                matches = await vector_search(vector, top_k=2)
                results["candidates"] = [m for m in matches if str(m.get("organizationId", org_id)) == str(org_id)]
                
            elif intent == "EXPLAIN_ATS":
                # Get candidates with lowest/highest ATS
                docs = await collection.find(match_query, {"candidateName":1, "atsScores":1}).sort("atsScores.overall_score", -1).limit(5).to_list(length=5)
                for d in docs: d["_id"] = str(d["_id"])
                results["ats_data"] = docs
                
            elif intent == "EXPLAIN_FRAUD":
                docs = await collection.find(match_query, {"candidateName":1, "fraudAnalysis":1}).sort("fraudAnalysis.trustScore", 1).limit(5).to_list(length=5)
                for d in docs: d["_id"] = str(d["_id"])
                results["fraud_data"] = docs
                
            elif intent == "EXPLAIN_SUCCESS":
                docs = await collection.find(match_query, {"candidateName":1, "successPrediction":1}).sort("successPrediction.successProbability", -1).limit(5).to_list(length=5)
                for d in docs: d["_id"] = str(d["_id"])
                results["success_data"] = docs
                
            elif intent == "FIND_HIDDEN_TALENT":
                # Search Knowledge Graph for hidden talents
                docs = await collection.find(
                    {**match_query, "knowledgeGraph.hiddenTalents": {"$exists": True, "$not": {"$size": 0}}},
                    {"candidateName":1, "knowledgeGraph":1}
                ).sort("knowledgeGraph.graphScore", -1).limit(5).to_list(length=5)
                for d in docs: d["_id"] = str(d["_id"])
                results["hidden_talent_data"] = docs
                
            elif intent == "GENERATE_INTERVIEW_PLAN":
                # Fetch top candidate
                vector = generate_query_embedding(query)
                matches = await vector_search(vector, top_k=1)
                results["candidate"] = matches[0] if matches else None
                
            elif intent == "HIRING_RECOMMENDATION":
                # Recommend top across success & skill
                docs = await collection.find(
                    {**match_query},
                    {"candidateName":1, "successPrediction":1, "skillGraph":1}
                ).sort("successPrediction.successProbability", -1).limit(3).to_list(length=3)
                for d in docs: d["_id"] = str(d["_id"])
                results["recommendations"] = docs
                
            elif intent == "ANALYTICS_QUERY":
                total = await collection.count_documents(match_query)
                avg_success_docs = await collection.aggregate([
                    {"$match": match_query},
                    {"$group": {"_id": None, "avg_success": {"$avg": "$successPrediction.successProbability"}}}
                ]).to_list(length=1)
                avg_success = avg_success_docs[0]["avg_success"] if avg_success_docs else 0
                results["analytics"] = {"total_candidates": total, "average_success_probability": avg_success}
                
            elif intent == "VOICE_VIDEO_ANALYTICS":
                # Find candidates with the strongest Voice/Video performance
                docs = await collection.find(
                    {**match_query, "voiceVideoAnalysis": {"$exists": True, "$not": {"$size": 0}}},
                    {"candidateName":1, "voiceVideoAnalysis": {"$slice": -1}} # Get only the latest round
                ).to_list(length=10)
                
                # Sort manually in python to handle array slicing complexity
                for d in docs: d["_id"] = str(d["_id"])
                
                sort_key = "communicationScore"
                q = query.lower()
                if "confidence" in q:
                    sort_key = "confidenceScore"
                elif "leadership" in q:
                    sort_key = "leadershipPresenceScore"
                elif "integrity" in q or "authentic" in q:
                    sort_key = "interviewIntegrityScore"
                
                sorted_docs = sorted(docs, key=lambda x: x.get("voiceVideoAnalysis", [{}])[0].get(sort_key, 0), reverse=True)
                results["voice_video_data"] = sorted_docs[:5]
                results["sorted_by"] = sort_key
                
            else:
                results["info"] = "General QA - utilizing internal knowledge."

        except Exception as e:
            logger.error(f"Tool routing failed: {e}")
            results["error"] = str(e)

        state["tool_results"] = results
        emit_socket_event("COPILOT_TOOL_COMPLETED", {"tool": f"route_{intent.lower()}"})
        return state

    async def _node_reasoning_layer(self, state: RecruiterCopilotState) -> RecruiterCopilotState:
        emit_socket_event("COPILOT_TOOL_RUNNING", {"tool": "reasoning_layer"})
        try:
            llm = LLMRouter.get_llm("reasoning")
            chain = REASONING_PROMPT | llm | StrOutputParser()
            
            tool_data = json.dumps(state["tool_results"], default=str)[:4000]
            
            raw = await chain.ainvoke({
                "query": state["recruiter_query"],
                "intent": state["intent"],
                "tool_results": tool_data
            })
            
            data = json.loads(clean_json_str(raw))
            state["reasoning"] = data
        except Exception as e:
            logger.error(f"Reasoning layer failed: {e}")
            state["reasoning"] = {
                "selection_rationale": "Failed to reason deeply.",
                "hidden_strengths": [],
                "identified_risks": [],
                "recommended_next_action": "Review data manually."
            }
        emit_socket_event("COPILOT_TOOL_COMPLETED", {"tool": "reasoning_layer"})
        return state

    async def _node_generate_response(self, state: RecruiterCopilotState) -> RecruiterCopilotState:
        emit_socket_event("COPILOT_TOOL_RUNNING", {"tool": "generate_response"})
        try:
            llm = LLMRouter.get_llm("copilot")
            chain = RESPONSE_PROMPT | llm | StrOutputParser()
            
            tool_data = json.dumps(state["tool_results"], default=str)[:2000]
            reasoning_data = json.dumps(state["reasoning"], default=str)
            
            raw = await chain.ainvoke({
                "query": state["recruiter_query"],
                "reasoning": reasoning_data,
                "tool_results": tool_data
            })
            
            data = json.loads(clean_json_str(raw))
            
            # Combine everything for frontend
            state["final_response"] = {
                "message": data.get("summary", ""),
                "evidence": data.get("evidence", []),
                "suggested_next_action": data.get("recommended_action", ""),
                "confidence": data.get("confidence", 85),
                "best_candidate": data.get("best_candidate"),
                "risks": state["reasoning"].get("identified_risks", []),
                "strengths": state["reasoning"].get("hidden_strengths", []),
                "intent_detected": state["intent"]
            }
        except Exception as e:
            logger.error(f"Response generation failed: {e}")
            state["final_response"] = {
                "message": "I apologize, but I encountered an error formulating my final response.",
                "evidence": [],
                "suggested_next_action": "Please try your query again.",
                "confidence": 0,
                "intent_detected": state.get("intent", "UNKNOWN")
            }
        emit_socket_event("COPILOT_TOOL_COMPLETED", {"tool": "generate_response"})
        return state

    async def run(self, query: str, organization_id: str) -> dict:
        initial_state = {
            "organization_id": organization_id,
            "recruiter_query": sanitize_user_prompt(query),
            "intent": None,
            "tool_results": {},
            "reasoning": None,
            "final_response": None,
            "error": None
        }
        
        final_state = await self._graph.ainvoke(initial_state)
        return final_state.get("final_response", {})
