"""
workflows/recommendation_workflow.py
------------------------------------
AI Candidate Recommendation Engine using LangGraph.

Input: Job Description text
Output: Top candidates based on a weighted formula.
Formula: Final Score = 40% ATS + 30% Semantic + 20% Skill + 10% Experience
"""

import logging
from typing import TypedDict, Optional, Any

from langgraph.graph import StateGraph, END

from database import vector_search, get_mongo_collection
from embeddings import generate_query_embedding
from schemas.job_match_schema import JobMatchRequestSchema
from bson import ObjectId

logger = logging.getLogger(__name__)

class RecommendationState(TypedDict):
    job_description: str
    top_k: int
    query_vector: Optional[list[float]]
    vector_matches: Optional[list[dict]]
    ranked_candidates: Optional[list[dict]]
    error: Optional[str]

class RecommendationWorkflow:
    def __init__(self):
        graph = StateGraph(RecommendationState)

        graph.add_node("generate_embedding", self._node_generate_embedding)
        graph.add_node("semantic_search", self._node_semantic_search)
        graph.add_node("rank_candidates", self._node_rank_candidates)
        graph.add_node("update_mongo", self._node_update_mongo)
        graph.add_node("handle_failure", self._node_handle_failure)

        graph.set_entry_point("generate_embedding")
        
        graph.add_conditional_edges(
            "generate_embedding",
            lambda state: "handle_failure" if state.get("error") else "semantic_search"
        )
        
        graph.add_conditional_edges(
            "semantic_search",
            lambda state: "handle_failure" if state.get("error") else "rank_candidates"
        )
        
        graph.add_conditional_edges(
            "rank_candidates",
            lambda state: "handle_failure" if state.get("error") else "update_mongo"
        )
        
        graph.add_conditional_edges(
            "update_mongo",
            lambda state: "handle_failure" if state.get("error") else END
        )
        
        graph.add_edge("handle_failure", END)

        self._graph = graph.compile()

    async def _node_generate_embedding(self, state: RecommendationState) -> RecommendationState:
        logger.info("[RECOMMEND] Stage 1 - Generate embedding")
        try:
            state["query_vector"] = generate_query_embedding(state["job_description"])
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_semantic_search(self, state: RecommendationState) -> RecommendationState:
        logger.info("[RECOMMEND] Stage 2 - Semantic search via Mongo Vector Search")
        try:
            # We fetch more candidates than top_k to allow ranking to sort them out
            matches = await vector_search(state["query_vector"], top_k=state["top_k"] * 3)
            state["vector_matches"] = matches
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_rank_candidates(self, state: RecommendationState) -> RecommendationState:
        logger.info("[RECOMMEND] Stage 3 - Rank candidates")
        try:
            collection = get_mongo_collection()
            matches = state["vector_matches"]
            ranked = []
            for match in matches:
                resume_id = match["resume_id"]
                semantic_score = match.get("score", 0.0)
                
                doc = await collection.find_one({"_id": ObjectId(resume_id)})
                if not doc:
                    continue
                
                ats_score_obj = doc.get("atsScores", {})
                skill_graph = doc.get("skillGraph", {})
                
                # Extract scores
                overall_ats = ats_score_obj.get("overall_score", 0)
                skill_score = ats_score_obj.get("skill_completeness", 0)
                exp_score = ats_score_obj.get("experience_score", 0)
                
                overall_tech_score = skill_graph.get("overallTechnicalScore", 0)
                competency_level = skill_graph.get("competencyLevel", {})
                strengths = skill_graph.get("strengths", [])
                weaknesses = skill_graph.get("weaknesses", [])
                
                knowledge_graph = doc.get("knowledgeGraph", {})
                graph_score = knowledge_graph.get("graphScore", 0)
                hidden_talents = knowledge_graph.get("hiddenTalents", [])
                candidate_cluster = knowledge_graph.get("candidateCluster", "Unknown")
                
                voice_video_analysis = doc.get("voiceVideoAnalysis", [])
                
                # Assign competency points
                comp_points = 0
                for c_val in competency_level.values():
                    if c_val == "Expert": comp_points += 5
                    elif c_val == "Advanced": comp_points += 3
                    elif c_val == "Intermediate": comp_points += 1
                
                # Final Score = 35% ATS + 25% Semantic + 15% ATS_Skill + 10% Experience + 15% SkillGraph_TechScore
                scaled_semantic = semantic_score * 100
                final_score = (overall_ats * 0.35) + (scaled_semantic * 0.25) + (skill_score * 0.15) + (exp_score * 0.1) + (overall_tech_score * 0.15)
                
                # Add competency intelligence bonus (up to 20 points)
                final_score += min(comp_points, 20)
                
                # Add Knowledge Graph bonus (Phase 3C)
                graph_bonus = 0
                if graph_score > 75: graph_bonus += 5
                if hidden_talents: graph_bonus += (len(hidden_talents) * 2)
                
                final_score += graph_bonus
                
                # Add Voice & Video Intelligence Bonus (Phase 3E)
                voice_video_bonus = 0
                if voice_video_analysis and len(voice_video_analysis) > 0:
                    latest_vv = voice_video_analysis[-1]
                    if (latest_vv.get("communicationScore", 0) > 80 and 
                        latest_vv.get("leadershipPresenceScore", 0) > 80 and 
                        latest_vv.get("interviewIntegrityScore", 0) > 80):
                        voice_video_bonus += 10
                
                final_score += voice_video_bonus
                final_score = min(final_score, 100) # Cap at 100
                
                reason = f"Strong match based on ATS ({overall_ats}) and semantic similarity ({scaled_semantic:.1f})."
                if overall_tech_score > 80:
                    reason += f" Excellent technical competency intelligence ({overall_tech_score})."
                if graph_bonus > 0:
                    reason += f" Knowledge Graph Intelligence highlights strong '{candidate_cluster}' alignment and hidden talents."
                if voice_video_bonus > 0:
                    reason += f" Exceptional Voice/Video Intelligence (Communication & Leadership > 80)."
                if strengths:
                    reason += f" Key strengths: {', '.join(strengths[:2])}."
                
                ranked.append({
                    "resume_id": resume_id,
                    "candidateName": doc.get("candidateName", "Unknown"),
                    "final_score": round(final_score, 2),
                    "ats_score": overall_ats,
                    "semantic_score": round(scaled_semantic, 2),
                    "reason": reason,
                    "doc": doc
                })
                
            # Sort by final score descending
            ranked.sort(key=lambda x: x["final_score"], reverse=True)
            # Keep top_k
            state["ranked_candidates"] = ranked[:state["top_k"]]
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_update_mongo(self, state: RecommendationState) -> RecommendationState:
        logger.info("[RECOMMEND] Stage 4 - Update MongoDB with recommendations")
        try:
            collection = get_mongo_collection()
            for cand in state["ranked_candidates"]:
                await collection.update_one(
                    {"_id": ObjectId(cand["resume_id"])},
                    {"$set": {
                        "recommendationScore": cand["final_score"],
                        "recommendationReason": cand["reason"],
                        "semanticScore": cand["semantic_score"]
                    }}
                )
        except Exception as e:
            state["error"] = str(e)
        return state

    async def _node_handle_failure(self, state: RecommendationState) -> RecommendationState:
        logger.error(f"[RECOMMEND] Failed: {state.get('error')}")
        return state

    async def run(self, job_description: str, top_k: int = 5) -> dict:
        state = {
            "job_description": job_description,
            "top_k": top_k,
            "query_vector": None,
            "vector_matches": None,
            "ranked_candidates": None,
            "error": None
        }
        final_state = await self._graph.ainvoke(state)
        if final_state.get("error"):
            return {"error": final_state["error"]}
        
        # Clean up output (remove full doc from response)
        out = []
        for c in final_state.get("ranked_candidates", []):
            out.append({
                "resume_id": c["resume_id"],
                "candidateName": c["candidateName"],
                "final_score": c["final_score"],
                "ats_score": c["ats_score"],
                "semantic_score": c["semantic_score"],
                "reason": c["reason"]
            })
        return {"candidates": out}
