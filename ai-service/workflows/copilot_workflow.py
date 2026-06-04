"""
workflows/copilot_workflow.py
-----------------------------
Recruiter Copilot Agent using LangGraph.

Input: User query, chat history
Output: AI response (JSON with optional structured data).
"""

import json
import logging
from typing import TypedDict, Optional, List, Dict, Any

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import StateGraph, END

from database import vector_search, get_mongo_collection
from embeddings import generate_query_embedding
from services.gemini_service import GeminiService
from utils.parser_utils import clean_json_str
from bson import ObjectId
from workflows.recommendation_workflow import RecommendationWorkflow
from workflows.comparison_workflow import ComparisonWorkflow

logger = logging.getLogger(__name__)

INTENT_PROMPT = PromptTemplate.from_template(
    """You are a recruiter copilot intent detector.
    Given the user's query, classify the intent into ONE of the following categories:
    - "search": User wants to find candidates with specific skills or background (e.g. "Find React devs").
    - "recommend": User wants top candidates based on a full job description.
    - "compare": User wants to compare two specific candidates (if they provided IDs or names).
    - "chat": General recruitment questions or follow-up questions.
    
    User Query: {query}
    
    Return ONLY a valid JSON:
    {{
        "intent": "search|recommend|compare|chat"
    }}
    """
)

RESPONSE_PROMPT = PromptTemplate.from_template(
    """You are TalentAI's Recruiter Copilot.
    Respond to the user's query professionally based on the data provided below.
    
    User Query: {query}
    Intent: {intent}
    
    Data retrieved from tools:
    {tool_data}
    
    Provide a concise, professional response. If candidates were found, summarize their key strengths.
    Return ONLY a valid JSON:
    {{
        "message": "your conversational response to the user",
        "data": "optional structured data if applicable (e.g., candidate list array)"
    }}
    """
)

class CopilotState(TypedDict):
    query: str
    intent: Optional[str]
    tool_data: Optional[Any]
    response: Optional[dict]
    error: Optional[str]

class CopilotWorkflow:
    def __init__(self):
        graph = StateGraph(CopilotState)

        graph.add_node("detect_intent", self._node_detect_intent)
        graph.add_node("tool_search", self._node_tool_search)
        graph.add_node("tool_recommend", self._node_tool_recommend)
        graph.add_node("tool_compare", self._node_tool_compare)
        graph.add_node("tool_chat", self._node_tool_chat)
        graph.add_node("generate_response", self._node_generate_response)
        graph.add_node("handle_failure", self._node_handle_failure)

        graph.set_entry_point("detect_intent")
        
        # Route to specific tools based on intent
        def route_intent(state: CopilotState):
            if state.get("error"):
                return "handle_failure"
            intent = state.get("intent", "chat")
            if intent == "search":
                return "tool_search"
            elif intent == "recommend":
                return "tool_recommend"
            elif intent == "compare":
                return "tool_compare"
            return "tool_chat"
            
        graph.add_conditional_edges(
            "detect_intent",
            route_intent
        )
        
        # All tools route to generate_response
        for node in ["tool_search", "tool_recommend", "tool_compare", "tool_chat"]:
            graph.add_conditional_edges(
                node,
                lambda state: "handle_failure" if state.get("error") else "generate_response"
            )
            
        graph.add_conditional_edges(
            "generate_response",
            lambda state: "handle_failure" if state.get("error") else END
        )
        
        graph.add_edge("handle_failure", END)

        self._graph = graph.compile()
        self._recommendation_workflow = RecommendationWorkflow()
        self._comparison_workflow = ComparisonWorkflow()

    async def _node_detect_intent(self, state: CopilotState) -> CopilotState:
        logger.info(f"[COPILOT] Stage 1 - Detecting intent for query: {state['query']}")
        try:
            llm = GeminiService.get_instance().get_llm()
            chain = INTENT_PROMPT | llm | StrOutputParser()
            raw = await chain.ainvoke({"query": state["query"]})
            cleaned = clean_json_str(raw)
            intent_json = json.loads(cleaned)
            state["intent"] = intent_json.get("intent", "chat")
        except Exception as e:
            logger.error(f"[COPILOT] Intent detection failed: {e}")
            state["intent"] = "chat" # fallback
        return state

    async def _node_tool_search(self, state: CopilotState) -> CopilotState:
        logger.info("[COPILOT] Tool - Semantic Search")
        try:
            query_vector = generate_query_embedding(state["query"])
            matches = await vector_search(query_vector, top_k=5)
            state["tool_data"] = matches
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_tool_recommend(self, state: CopilotState) -> CopilotState:
        logger.info("[COPILOT] Tool - Recommend")
        try:
            res = await self._recommendation_workflow.run(state["query"], top_k=5)
            state["tool_data"] = res
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_tool_compare(self, state: CopilotState) -> CopilotState:
        logger.info("[COPILOT] Tool - Compare (Extraction requires two IDs, for now returning generic prompt)")
        # In a fully fleshed out system, we would extract candidate A and B IDs from the query.
        # For Phase 2A, we will assume standard chat or generic comparison if IDs aren't present.
        state["tool_data"] = {"note": "Comparison tool triggered. Need candidate IDs."}
        return state

    async def _node_tool_chat(self, state: CopilotState) -> CopilotState:
        logger.info("[COPILOT] Tool - Chat")
        state["tool_data"] = {"note": "No specific tools triggered."}
        return state

    async def _node_generate_response(self, state: CopilotState) -> CopilotState:
        logger.info("[COPILOT] Stage 3 - Generating Response")
        try:
            llm = GeminiService.get_instance().get_llm()
            chain = RESPONSE_PROMPT | llm | StrOutputParser()
            raw = await chain.ainvoke({
                "query": state["query"],
                "intent": state["intent"],
                "tool_data": json.dumps(state["tool_data"], default=str)
            })
            cleaned = clean_json_str(raw)
            try:
                state["response"] = json.loads(cleaned)
            except json.JSONDecodeError:
                logger.warning(f"[COPILOT] LLM did not return JSON. Using raw text fallback. Text: {cleaned[:100]}")
                state["response"] = {"message": cleaned, "data": None}
                
            # Inject structured data so UI can render widgets
            if state["intent"] in ["search", "recommend"]:
                state["response"]["data"] = state["tool_data"]
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_handle_failure(self, state: CopilotState) -> CopilotState:
        logger.error(f"[COPILOT] Failed: {state.get('error')}")
        state["response"] = {"message": "Sorry, I encountered an error.", "data": None}
        return state

    async def run(self, query: str) -> dict:
        state = {
            "query": query,
            "intent": None,
            "tool_data": None,
            "response": None,
            "error": None
        }
        final_state = await self._graph.ainvoke(state)
        return final_state.get("response", {"message": "Error processing query."})
