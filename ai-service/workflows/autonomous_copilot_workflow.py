"""
workflows/autonomous_copilot_workflow.py
----------------------------------------
Autonomous Recruiter Copilot Workflow.
"""

import json
import logging
from typing import Any, Dict, List, Optional, TypedDict

from bson import ObjectId
from database import get_mongo_collection, vector_search
from embeddings import generate_query_embedding
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import END, StateGraph
from services.llm.llm_router import LLMRouter

from utils.parser_utils import clean_json_str
from utils.security_utils import sanitize_user_prompt

logger = logging.getLogger(__name__)

INTENT_PROMPT = PromptTemplate.from_template(
    """You are an autonomous recruiter copilot intent detector.
    Given the user's query, classify the intent into ONE of the following categories:
    - "search_candidates"
    - "compare_candidates"
    - "recommend_candidates"
    - "interview_analysis"
    - "fraud_analysis"
    - "success_prediction"
    - "authenticity_analysis"
    - "hiring_insights"
    - "executive_summary"
    - "skill_graph"
    - "competency_search"
    - "graph_search"
    
    User Query: {query}
    
    Return ONLY a valid JSON:
    {{
        "intent": "string"
    }}
    """
)

PLAN_PROMPT = PromptTemplate.from_template(
    """You are the planning node for the Autonomous Recruiter Copilot.
    Based on the user's query and intent, generate a sequential execution plan of tools to call.
    
    Available tools:
    - tool_search_candidates
    - tool_compare_candidates
    - tool_recommend_candidates
    - tool_fraud_analysis
    - tool_success_prediction
    - tool_authenticity
    - "tool_analytics"
    - "tool_hiring_insights"
    - "tool_skill_graph"
    - "tool_competency_search"
    - "tool_graph_search"
    
    User Query: {query}
    Intent: {intent}
    
    Return ONLY a valid JSON with an array of tool names to execute in order:
    {{
        "plan": ["tool_search_candidates", "tool_fraud_analysis"]
    }}
    """
)

RECOMMENDATION_PROMPT = PromptTemplate.from_template(
    """You are the Autonomous Recruiter Copilot. 
    Synthesize the following tool execution results and provide a comprehensive recommendation to the recruiter.
    
    User Query: {query}
    Intent: {intent}
    
    Tool Results:
    {tool_results}
    
    Your response must include:
    - Best Candidate (if applicable)
    - Risks
    - Strengths
    - Suggested Next Action
    
    Return ONLY a valid JSON:
    {{
        "message": "A conversational overview addressing the query",
        "best_candidate": "Name or N/A",
        "risks": ["risk 1", "risk 2"],
        "strengths": ["strength 1", "strength 2"],
        "suggested_next_action": "e.g., Schedule technical interview"
    }}
    """
)


class AutonomousState(TypedDict):
    user_query: str
    organization_id: Optional[str]
    intent: Optional[str]
    plan: List[str]
    current_step_index: int
    intermediate_results: Dict[str, Any]
    final_response: Optional[dict]
    error: Optional[str]


class AutonomousCopilotWorkflow:
    def __init__(self):
        graph = StateGraph(AutonomousState)

        graph.add_node("detect_intent", self._node_detect_intent)
        graph.add_node("plan_actions", self._node_plan_actions)
        graph.add_node("execute_tools", self._node_execute_tools)
        graph.add_node(
            "generate_recruiter_recommendation", self._node_generate_recommendation
        )
        graph.add_node("handle_error", self._node_handle_error)

        graph.set_entry_point("detect_intent")
        graph.add_edge("detect_intent", "plan_actions")
        graph.add_edge("plan_actions", "execute_tools")

        # Loop over execute_tools until plan is complete
        def check_plan_status(state: AutonomousState):
            if state.get("error"):
                return "handle_error"
            if state["current_step_index"] < len(state.get("plan", [])):
                return "execute_tools"
            return "generate_recruiter_recommendation"

        graph.add_conditional_edges("execute_tools", check_plan_status)
        graph.add_edge("generate_recruiter_recommendation", END)
        graph.add_edge("handle_error", END)

        self._graph = graph.compile()

    async def _node_detect_intent(self, state: AutonomousState) -> AutonomousState:
        logger.info(f"[AUTONOMOUS COPILOT] Detecting intent for: {state['user_query']}")
        try:
            llm = LLMRouter.get_llm("copilot")
            chain = INTENT_PROMPT | llm | StrOutputParser()
            raw = await chain.ainvoke({"query": state["user_query"]})
            cleaned = clean_json_str(raw)
            data = json.loads(cleaned)
            state["intent"] = data.get("intent", "search_candidates")
        except Exception as e:
            logger.error(f"Intent detection failed: {e}")
            state["intent"] = "search_candidates"
        return state

    async def _node_plan_actions(self, state: AutonomousState) -> AutonomousState:
        logger.info(
            f"[AUTONOMOUS COPILOT] Planning actions for intent: {state['intent']}"
        )
        try:
            llm = LLMRouter.get_llm("copilot")
            chain = PLAN_PROMPT | llm | StrOutputParser()
            raw = await chain.ainvoke(
                {"query": state["user_query"], "intent": state["intent"]}
            )
            cleaned = clean_json_str(raw)
            data = json.loads(cleaned)
            state["plan"] = data.get("plan", ["tool_search_candidates"])
            state["current_step_index"] = 0
            state["intermediate_results"] = {}
        except Exception as e:
            logger.error(f"Planning failed: {e}")
            state["plan"] = ["tool_search_candidates"]
            state["current_step_index"] = 0
            state["intermediate_results"] = {}
        return state

    async def _node_execute_tools(self, state: AutonomousState) -> AutonomousState:
        idx = state["current_step_index"]
        plan = state["plan"]

        if idx >= len(plan):
            return state

        tool = plan[idx]
        logger.info(f"[AUTONOMOUS COPILOT] Executing tool: {tool}")

        try:
            result = await self._run_tool(tool, state)
            state["intermediate_results"][tool] = result
        except Exception as e:
            logger.error(f"Tool {tool} failed: {e}")
            state["intermediate_results"][tool] = {"error": str(e)}

        state["current_step_index"] += 1
        return state

    async def _run_tool(self, tool: str, state: AutonomousState) -> Any:
        collection = get_mongo_collection()
        org_id = state.get("organization_id")
        match_query = {}
        if org_id:
            match_query["organizationId"] = org_id

        if tool == "tool_search_candidates":
            query_vector = generate_query_embedding(state["user_query"])
            matches = await vector_search(query_vector, top_k=3)
            return {"matches": matches}

        elif tool == "tool_fraud_analysis":
            resumes = (
                await collection.find(
                    {**match_query, "fraudAnalysis": {"$exists": True, "$ne": None}},
                    {
                        "candidateName": 1,
                        "fraudAnalysis.fraudRisk": 1,
                        "fraudAnalysis.trustScore": 1,
                    },
                )
                .sort("fraudAnalysis.trustScore", 1)
                .to_list(length=5)
            )
            for r in resumes:
                r["_id"] = str(r["_id"])
            return {"high_risk_candidates": resumes}

        elif tool == "tool_success_prediction":
            resumes = (
                await collection.find(
                    {
                        **match_query,
                        "successPrediction": {"$exists": True, "$ne": None},
                    },
                    {
                        "candidateName": 1,
                        "successPrediction.successProbability": 1,
                        "successPrediction.leadershipPotential": 1,
                        "successPrediction.culturalFit": 1,
                    },
                )
                .sort("successPrediction.successProbability", -1)
                .to_list(length=5)
            )
            for r in resumes:
                r["_id"] = str(r["_id"])
            return {"top_predicted_candidates": resumes}

        elif tool == "tool_authenticity":
            resumes = (
                await collection.find(
                    {
                        **match_query,
                        "answerAuthenticity": {"$exists": True, "$ne": None},
                    },
                    {
                        "candidateName": 1,
                        "answerAuthenticity.authenticityScore": 1,
                        "answerAuthenticity.aiGeneratedProbability": 1,
                        "answerAuthenticity.suspiciousAnswers": 1,
                    },
                )
                .sort("answerAuthenticity.authenticityScore", 1)
                .to_list(length=5)
            )
            for r in resumes:
                r["_id"] = str(r["_id"])
            return {"suspicious_candidates": resumes}

        elif tool == "tool_analytics":
            # Simple aggregate mock for tool
            total = await collection.count_documents(match_query)
            processed = await collection.count_documents(
                {**match_query, "status": "PROCESSED"}
            )
            return {"total_resumes": total, "processed": processed}

        elif tool == "tool_skill_graph":
            # Return top technical and soft skills to Copilot
            top_tech = await collection.aggregate(
                [
                    {
                        "$match": {
                            **match_query,
                            "skillGraph.technicalSkills": {"$exists": True},
                        }
                    },
                    {"$unwind": "$skillGraph.technicalSkills"},
                    {
                        "$group": {
                            "_id": "$skillGraph.technicalSkills.skill",
                            "avgScore": {"$avg": "$skillGraph.technicalSkills.score"},
                        }
                    },
                    {"$sort": {"avgScore": -1}},
                    {"$limit": 5},
                ]
            ).to_list(length=5)
            top_soft = await collection.aggregate(
                [
                    {
                        "$match": {
                            **match_query,
                            "skillGraph.softSkills": {"$exists": True},
                        }
                    },
                    {"$unwind": "$skillGraph.softSkills"},
                    {
                        "$group": {
                            "_id": "$skillGraph.softSkills.skill",
                            "avgScore": {"$avg": "$skillGraph.softSkills.score"},
                        }
                    },
                    {"$sort": {"avgScore": -1}},
                    {"$limit": 5},
                ]
            ).to_list(length=5)
            return {"top_technical_skills": top_tech, "top_soft_skills": top_soft}

        elif tool == "tool_competency_search":
            # Extract criteria from query
            try:
                llm = LLMRouter.get_llm("copilot")
                extract_chain = (
                    PromptTemplate.from_template(
                        """Extract search criteria from: {query}
                    Return JSON: {{"skill": "string or null", "competency": "string or null (e.g. leadership, technical, communication, problemSolving)", "is_weakness": boolean}}"""
                    )
                    | llm
                    | StrOutputParser()
                )
                raw = await extract_chain.ainvoke({"query": state["user_query"]})
                criteria = json.loads(clean_json_str(raw))

                db_query = {**match_query}

                if criteria.get("competency"):
                    comp = criteria["competency"]
                    if criteria.get("is_weakness"):
                        db_query[f"skillGraph.competencyLevel.{comp}"] = {
                            "$in": ["Beginner", "Intermediate"]
                        }
                    else:
                        db_query[f"skillGraph.competencyLevel.{comp}"] = {
                            "$in": ["Expert", "Advanced"]
                        }
                elif criteria.get("skill"):
                    skill = criteria["skill"]
                    if criteria.get("is_weakness"):
                        db_query["skillGraph.weaknesses"] = {
                            "$regex": f"^{skill}$",
                            "$options": "i",
                        }
                    else:
                        db_query["skillGraph.technicalSkills"] = {
                            "$elemMatch": {
                                "skill": {"$regex": f"^{skill}$", "$options": "i"},
                                "score": {"$gte": 80},
                            }
                        }

                resumes = (
                    await collection.find(
                        db_query,
                        {
                            "candidateName": 1,
                            "skillGraph.competencyLevel": 1,
                            "skillGraph.technicalSkills": 1,
                            "skillGraph.overallTechnicalScore": 1,
                        },
                    )
                    .sort("skillGraph.overallTechnicalScore", -1)
                    .to_list(length=10)
                )

                for r in resumes:
                    r["_id"] = str(r["_id"])

                return {"competency_matches": resumes, "extracted_criteria": criteria}
            except Exception as e:
                logger.error(f"Competency search extraction failed: {e}")
                return {"error": str(e)}

        elif tool == "tool_graph_search":
            try:
                llm = LLMRouter.get_llm("copilot")
                extract_chain = (
                    PromptTemplate.from_template(
                        """Extract graph search criteria from: {query}
                    Return JSON: {{"cluster": "string or null", "hidden_talent": "string or null", "similar_to_name": "string or null"}}"""
                    )
                    | llm
                    | StrOutputParser()
                )
                raw = await extract_chain.ainvoke({"query": state["user_query"]})
                criteria = json.loads(clean_json_str(raw))

                db_query = {**match_query}

                if criteria.get("cluster"):
                    db_query["knowledgeGraph.candidateCluster"] = {
                        "$regex": f"^{criteria['cluster']}$",
                        "$options": "i",
                    }

                if criteria.get("hidden_talent"):
                    db_query["knowledgeGraph.hiddenTalents"] = {
                        "$regex": f"^{criteria['hidden_talent']}$",
                        "$options": "i",
                    }

                if criteria.get("similar_to_name"):
                    base_cand = await collection.find_one(
                        {
                            **match_query,
                            "candidateName": {
                                "$regex": f"^{criteria['similar_to_name']}$",
                                "$options": "i",
                            },
                        }
                    )
                    if base_cand and base_cand.get("knowledgeGraph", {}).get(
                        "similarCandidates"
                    ):
                        similar_ids = [
                            ObjectId(c["resumeId"])
                            for c in base_cand["knowledgeGraph"]["similarCandidates"]
                        ]
                        db_query["_id"] = {"$in": similar_ids}
                    else:
                        return {
                            "error": f"Base candidate {criteria['similar_to_name']} not found or has no similar candidates."
                        }

                resumes = (
                    await collection.find(
                        db_query,
                        {
                            "candidateName": 1,
                            "knowledgeGraph": 1,
                            "atsScores.overall_score": 1,
                        },
                    )
                    .sort("knowledgeGraph.graphScore", -1)
                    .to_list(length=10)
                )

                for r in resumes:
                    r["_id"] = str(r["_id"])

                return {"graph_matches": resumes, "extracted_criteria": criteria}
            except Exception as e:
                logger.error(f"Graph search extraction failed: {e}")
                return {"error": str(e)}

        elif tool in [
            "tool_compare_candidates",
            "tool_recommend_candidates",
            "tool_hiring_insights",
        ]:
            return {
                "status": "executed",
                "details": f"{tool} executed successfully. Note: deep integration omitted for brevity in demo.",
            }

        return {"error": f"Unknown tool: {tool}"}

    async def _node_generate_recommendation(
        self, state: AutonomousState
    ) -> AutonomousState:
        logger.info(
            "[AUTONOMOUS COPILOT] Synthesizing results and generating recommendation"
        )
        try:
            llm = LLMRouter.get_llm("copilot")
            chain = RECOMMENDATION_PROMPT | llm | StrOutputParser()
            raw = await chain.ainvoke(
                {
                    "query": state["user_query"],
                    "intent": state["intent"],
                    "tool_results": json.dumps(
                        state["intermediate_results"], default=str
                    ),
                }
            )
            cleaned = clean_json_str(raw)
            state["final_response"] = json.loads(cleaned)
            state["final_response"]["plan"] = state["plan"]
            state["final_response"]["results"] = state["intermediate_results"]
        except Exception as e:
            logger.error(f"Generation failed: {e}")
            state["error"] = str(e)
            state["final_response"] = {
                "message": "Failed to generate recommendation.",
                "best_candidate": "N/A",
                "risks": [],
                "strengths": [],
                "suggested_next_action": "Review logs",
            }
        return state

    async def _node_handle_error(self, state: AutonomousState) -> AutonomousState:
        state["final_response"] = {
            "message": f"An error occurred: {state.get('error')}",
            "plan": [],
            "results": {},
            "best_candidate": "N/A",
            "risks": [],
            "strengths": [],
            "suggested_next_action": "Try again",
        }
        return state

    async def run(self, query: str, organization_id: str = None) -> dict:
        state = {
            "user_query": sanitize_user_prompt(query),
            "organization_id": organization_id,
            "intent": None,
            "plan": [],
            "current_step_index": 0,
            "intermediate_results": {},
            "final_response": None,
            "error": None,
        }
        final_state = await self._graph.ainvoke(state)
        return final_state.get("final_response", {})
