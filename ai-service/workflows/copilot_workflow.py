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
from services.llm.llm_router import LLMRouter
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
    - "trust": User is asking about fraud risk, suspicious claims, trustworthy candidates, or contradictions (e.g. "Show suspicious candidates", "Explain trust scores").
    - "fraud_check": For questions about fraud risk, consistency, verification, authentication.
    - "skill_gap": For questions about skill gaps, missing technologies, hiring readiness, growth potential, or learning plans.
    - "predictive_hiring": For questions about future success, retention risk, team fit, leadership potential, or final hiring decisions.
    - "analytics": For questions about hiring trends, funnels, dashboards, or organization-level analytics.
    
    User Query: {query}
    
    Return ONLY a valid JSON:
    {{
        "intent": "search|recommend|compare|trust|fraud_check|skill_gap|predictive_hiring|analytics|chat"
    }}
    """
)

COMPARE_EXTRACTION_PROMPT = PromptTemplate.from_template(
    """Extract the names of the two candidates the user wants to compare.
    Query: {query}
    
    Return ONLY a valid JSON object matching this schema:
    {{
        "candidate_a_name": "string or null",
        "candidate_b_name": "string or null"
    }}
    """
)

RESPONSE_PROMPT = PromptTemplate.from_template(
    """You are TalentAI's Recruiter Copilot.
    Respond to the user's query professionally based on the data provided below.
    
    User Query: {query}
    Intent: {intent}
    
    Analytics Summary (If available and relevant):
    {analytics_summary}
    
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
    context_data: List[str]
    analytics_summary: Optional[dict]

class CopilotWorkflow:
    def __init__(self):
        graph = StateGraph(CopilotState)

        graph.add_node("detect_intent", self._node_detect_intent)
        graph.add_node("tool_search", self._node_tool_search)
        graph.add_node("tool_recommend", self._node_tool_recommend)
        graph.add_node("tool_compare", self._node_tool_compare)
        graph.add_node("tool_trust", self._node_tool_trust)
        graph.add_node("tool_fraud_search", self._node_tool_fraud)
        graph.add_node("tool_skill_gap", self._node_tool_skill_gap)
        graph.add_node("tool_predictive_hiring", self._node_tool_predictive_hiring)
        graph.add_node("tool_pipeline_analytics", self._node_tool_pipeline_analytics)
        graph.add_node("tool_chat", self._node_tool_chat)
        graph.add_node("generate_response", self._node_generate_response)
        graph.add_node("handle_failure", self._node_handle_failure)

        graph.set_entry_point("detect_intent")
        
        # Route to specific tools based on intent
        def route_intent(state: CopilotState):
            if state.get("error"):
                return "handle_failure"
            intent = state.get("intent", "chat")
            mapping = {
                "search": "tool_search",
                "recommend": "tool_recommend",
                "compare": "tool_compare",
                "trust": "tool_trust",
                "fraud_check": "tool_fraud_search",
                "skill_gap": "tool_skill_gap",
                "predictive_hiring": "tool_predictive_hiring",
                "analytics": "tool_pipeline_analytics"
            }
            return mapping.get(intent, "tool_chat")
            
        graph.add_conditional_edges(
            "detect_intent",
            route_intent
        )
        
        # All tools route to generate_response
        for node in ["tool_search", "tool_recommend", "tool_compare", "tool_trust", "tool_fraud_search", "tool_skill_gap", "tool_predictive_hiring", "tool_pipeline_analytics", "tool_chat"]:
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
            llm = LLMRouter.get_llm("copilot")
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
            
            # Retrieve full data from Mongo to provide rich context to LLM
            collection = get_mongo_collection()
            full_profiles = []
            for match in matches:
                doc = await collection.find_one({"_id": ObjectId(match["resume_id"])})
                if doc:
                    parsed_data = doc.get("parsedData", {})
                    full_profiles.append({
                        "id": str(doc["_id"]),
                        "candidateName": doc.get("candidateName", match["metadata"]["filename"]),
                        "score": match["score"],
                        "skills": parsed_data.get("skills", []),
                        "experience": parsed_data.get("experience", []),
                        "projects": parsed_data.get("projects", []),
                        "education": parsed_data.get("education", [])
                    })
            state["tool_data"] = full_profiles
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
        logger.info("[COPILOT] Tool - Compare")
        try:
            llm = LLMRouter.get_llm("copilot")
            chain = COMPARE_EXTRACTION_PROMPT | llm | StrOutputParser()
            raw = await chain.ainvoke({"query": state["query"]})
            cleaned = clean_json_str(raw)
            names = json.loads(cleaned)
            
            name_a = names.get("candidate_a_name")
            name_b = names.get("candidate_b_name")
            
            if not name_a or not name_b:
                state["tool_data"] = {"note": "Could not extract two distinct candidate names to compare."}
                return state
                
            collection = get_mongo_collection()
            
            # Simple prefix/regex match for names
            cand_a = await collection.find_one({"candidateName": {"$regex": f"^{name_a}", "$options": "i"}})
            cand_b = await collection.find_one({"candidateName": {"$regex": f"^{name_b}", "$options": "i"}})
            
            if cand_a and cand_b:
                logger.info(f"[COPILOT] Found compare candidates: {cand_a['_id']} and {cand_b['_id']}")
                res = await self._comparison_workflow.run(str(cand_a["_id"]), str(cand_b["_id"]))
                state["tool_data"] = res
            else:
                missing = []
                if not cand_a: missing.append(name_a)
                if not cand_b: missing.append(name_b)
                state["tool_data"] = {"note": f"Could not find the following candidates in the database: {', '.join(missing)}"}
                
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_tool_trust(self, state: CopilotState) -> CopilotState:
        logger.info("[COPILOT] Tool - Trust/Fraud")
        try:
            collection = get_mongo_collection()
            # Fetch candidates that have fraudAnalysis
            cursor = collection.find(
                {"fraudAnalysis": {"$exists": True, "$ne": None}},
                {"candidateName": 1, "fraudAnalysis.fraudRisk": 1, "fraudAnalysis.trustScore": 1, "fraudAnalysis.hiringImpact": 1, "fraudAnalysis.recruiterDecision": 1, "fraudAnalysis.contradictions": 1, "fraudAnalysis.suspiciousClaims": 1}
            ).limit(20)
            
            candidates = []
            async for doc in cursor:
                doc["_id"] = str(doc["_id"])
                candidates.append(doc)
                
            state["tool_data"] = {"candidates_with_fraud_data": candidates}
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_tool_fraud(self, state: CopilotState) -> CopilotState:
        return await self._node_tool_trust(state)

    async def _node_tool_skill_gap(self, state: CopilotState) -> CopilotState:
        logger.info("[COPILOT] Executing skill gap tool")
        try:
            collection = get_mongo_collection()
            resumes = await collection.find(
                {"skillGapAnalysis": {"$exists": True, "$ne": None}},
                {"parsedData.personalInfo.name": 1, "skillGapAnalysis": 1}
            ).to_list(length=10)
            
            ctx = "Skill Gap Insights:\n"
            for r in resumes:
                name = r.get("parsedData", {}).get("personalInfo", {}).get("name", "Unknown")
                sg = r.get("skillGapAnalysis", {})
                hr = sg.get("hiringReadinessScore", "N/A")
                gp = sg.get("growthPotentialScore", "N/A")
                weak = sg.get("weaknesses", [])
                ctx += f"- {name}: Readiness {hr}, Growth Potential {gp}. Weaknesses: {', '.join(weak[:3])}\n"
            
            state["tool_data"] = ctx
        except Exception as e:
            logger.error(f"[COPILOT] Skill gap tool error: {e}")
            state["error"] = str(e)
        return state

    async def _node_tool_predictive_hiring(self, state: CopilotState) -> CopilotState:
        logger.info("[COPILOT] Executing predictive hiring tool")
        try:
            collection = get_mongo_collection()
            resumes = await collection.find(
                {"$or": [{"predictiveHiring": {"$exists": True, "$ne": None}}, {"successPrediction": {"$exists": True, "$ne": None}}]},
                {"parsedData.personalInfo.name": 1, "predictiveHiring": 1, "successPrediction": 1}
            ).sort("predictiveHiring.successScore", -1).to_list(length=10)
            
            ctx = "Predictive Hiring Intelligence & Success Predictions:\n"
            for r in resumes:
                name = r.get("parsedData", {}).get("personalInfo", {}).get("name", "Unknown")
                ph = r.get("predictiveHiring", {})
                sp = r.get("successPrediction", {})
                
                score = ph.get("successScore", "N/A")
                retention = sp.get("retentionRisk", ph.get("retentionRisk", "N/A"))
                leadership = sp.get("leadershipPotential", ph.get("leadershipPotential", "N/A"))
                decision = ph.get("hiringDecision", "N/A")
                success_prob = sp.get("successProbability", "N/A")
                agility = sp.get("learningAgility", "N/A")
                culture = sp.get("culturalFit", "N/A")
                dev_areas = ", ".join(sp.get("developmentAreas", [])) or "None"
                
                ctx += f"- {name}: Success Prob {success_prob}%, Predictive Score {score}, Retention Risk {retention}, Leadership {leadership}, Agility {agility}, Culture Fit {culture}, Dev Areas: {dev_areas}, Decision: {decision}\n"
            
            state["tool_data"] = ctx
        except Exception as e:
            logger.error(f"[COPILOT] Predictive hiring tool error: {e}")
            state["error"] = str(e)
        return state

    async def _node_tool_pipeline_analytics(self, state: CopilotState) -> CopilotState:
        logger.info("[COPILOT] Executing pipeline analytics tool")
        try:
            collection = get_mongo_collection()
            
            # Aggregate to get pipeline counts
            pipeline_aggregate = await collection.aggregate([
                {"$group": {"_id": "$pipelineStage", "count": {"$sum": 1}}}
            ]).to_list(length=20)
            
            # Fetch candidates who are stuck or need attention (high priority / old stageEnteredAt)
            # For simplicity, we just fetch a few candidates with their stage and days in stage
            import datetime
            now = datetime.datetime.utcnow()
            
            resumes = await collection.find(
                {"pipelineStage": {"$nin": ["Hired", "Rejected"]}},
                {"candidateName": 1, "pipelineStage": 1, "stageEnteredAt": 1, "createdAt": 1, "priority": 1}
            ).to_list(length=20)
            
            ctx = "Pipeline Analytics Overview:\n"
            for p in pipeline_aggregate:
                ctx += f"- Stage '{p.get('_id', 'Unknown')}': {p['count']} candidates\n"
                
            ctx += "\nCandidate Status:\n"
            for r in resumes:
                name = r.get("candidateName", "Unknown")
                stage = r.get("pipelineStage", "Applied")
                priority = r.get("priority", "Medium")
                entered_at = r.get("stageEnteredAt", r.get("createdAt"))
                
                days_in_stage = 0
                if entered_at:
                    try:
                        days_in_stage = (now - entered_at).days
                    except:
                        pass
                        
                ctx += f"- {name} is in '{stage}' (Priority: {priority}). Days in stage: {days_in_stage}\n"
                
            state["tool_data"] = ctx
        except Exception as e:
            logger.error(f"[COPILOT] Pipeline analytics tool error: {e}")
            state["error"] = str(e)
        return state

    async def _node_tool_chat(self, state: CopilotState) -> CopilotState:
        logger.info("[COPILOT] Tool - Chat")
        state["tool_data"] = {"note": "No specific tools triggered."}
        return state

    async def _node_generate_response(self, state: CopilotState) -> CopilotState:
        logger.info("[COPILOT] Stage 3 - Generating Response")
        try:
            llm = LLMRouter.get_llm("copilot")
            chain = RESPONSE_PROMPT | llm | StrOutputParser()
            raw = await chain.ainvoke({
                "query": state["query"],
                "intent": state["intent"],
                "analytics_summary": json.dumps(state.get("analytics_summary") or {}),
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

    async def run(self, query: str, analytics_summary: dict | None = None) -> dict:
        state = {
            "query": query,
            "intent": None,
            "tool_data": None,
            "response": None,
            "error": None,
            "analytics_summary": analytics_summary
        }
        final_state = await self._graph.ainvoke(state)
        return final_state.get("response", {"message": "Error processing query."})
