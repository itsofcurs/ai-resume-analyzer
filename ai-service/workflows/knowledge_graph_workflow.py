"""
workflows/knowledge_graph_workflow.py
-------------------------------------
Phase 3C Knowledge Graph Candidate Intelligence
"""

import json
import logging
import datetime
import requests
from typing import TypedDict, Optional, List, Dict, Any

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
from bson import ObjectId

from database import get_mongo_collection
from services.llm.llm_router import LLMRouter
from utils.parser_utils import clean_json_str
import os

logger = logging.getLogger(__name__)

def emit_socket_event(event_name: str, payload: dict):
    # Fire and forget socket event
    node_url = os.environ.get("NODE_SERVICE_URL", "http://localhost:5000")
    try:
        requests.post(f"{node_url}/api/copilot/emit", json={"event": event_name, "payload": payload}, timeout=2)
    except:
        pass

# PROMPTS
SKILL_NETWORK_PROMPT = PromptTemplate.from_template(
    """Analyze the candidate's parsed skills: {skills}
    Generate a list of 'connectedSkills' identifying relationships between these skills with a confidence weight (1-100).
    Also map their 'relatedProjects' to infer project relevance (1-100) based on their parsed experience: {experience}.
    
    Return ONLY a JSON:
    {{
        "connectedSkills": [
            {{"skill": "React", "weight": 95}}
        ],
        "relatedProjects": [
            {{"project": "Built a CRM system", "relevance": 85}}
        ]
    }}
    """
)

HIDDEN_TALENT_PROMPT = PromptTemplate.from_template(
    """Analyze the candidate's skills, ATS scores, and interview performance.
    Skills: {skills}
    Experience: {experience}
    
    Infer 'hiddenTalents' (capabilities they possess but didn't explicitly highlight as top skills, e.g., if they use LangGraph they know AI Architecture) and 'inferredStrengths'.
    
    Return ONLY a JSON:
    {{
        "hiddenTalents": ["AI Architecture", "System Design"],
        "inferredStrengths": ["Problem Solving", "Rapid Prototyping"]
    }}
    """
)

CLUSTER_PROMPT = PromptTemplate.from_template(
    """Assign this candidate to a single primary 'candidateCluster' based on their data.
    Allowed clusters: Frontend Specialist, Backend Specialist, AI Engineer, Data Scientist, Leadership Track, Full Stack Engineer, DevOps Engineer, Cloud Architect.
    
    Data: {data}
    
    Return ONLY a JSON:
    {{
        "candidateCluster": "AI Engineer"
    }}
    """
)

class KnowledgeGraphState(TypedDict):
    resume_id: str
    organization_id: str
    
    # Raw Data
    resume_data: Optional[dict]
    
    # Processed Data
    connected_skills: Optional[list]
    related_projects: Optional[list]
    hidden_talents: Optional[list]
    inferred_strengths: Optional[list]
    candidate_cluster: Optional[str]
    similar_candidates: Optional[list]
    graph_score: Optional[int]
    
    error: Optional[str]

class KnowledgeGraphWorkflow:
    def __init__(self):
        builder = StateGraph(KnowledgeGraphState)
        
        builder.add_node("load_candidate", self._node_load_candidate)
        builder.add_node("build_networks", self._node_build_networks)
        builder.add_node("detect_hidden_talents", self._node_detect_hidden_talents)
        builder.add_node("cluster_candidate", self._node_cluster_candidate)
        builder.add_node("find_similar_candidates", self._node_find_similar_candidates)
        builder.add_node("generate_graph_summary", self._node_generate_graph_summary)
        builder.add_node("persist", self._node_persist)
        
        builder.set_entry_point("load_candidate")
        
        # Edges
        builder.add_conditional_edges("load_candidate", lambda s: "build_networks" if not s.get("error") else END, ["build_networks", END])
        builder.add_conditional_edges("build_networks", lambda s: "detect_hidden_talents" if not s.get("error") else END, ["detect_hidden_talents", END])
        builder.add_conditional_edges("detect_hidden_talents", lambda s: "cluster_candidate" if not s.get("error") else END, ["cluster_candidate", END])
        builder.add_conditional_edges("cluster_candidate", lambda s: "find_similar_candidates" if not s.get("error") else END, ["find_similar_candidates", END])
        builder.add_conditional_edges("find_similar_candidates", lambda s: "generate_graph_summary" if not s.get("error") else END, ["generate_graph_summary", END])
        builder.add_conditional_edges("generate_graph_summary", lambda s: "persist" if not s.get("error") else END, ["persist", END])
        builder.add_edge("persist", END)
        
        self._graph = builder.compile()

    async def _node_load_candidate(self, state: KnowledgeGraphState) -> KnowledgeGraphState:
        emit_socket_event("GRAPH_ANALYZING", {"resumeId": state["resume_id"], "status": "Loading Data"})
        try:
            collection = get_mongo_collection()
            doc = await collection.find_one({
                "_id": ObjectId(state["resume_id"]),
                "organizationId": state["organization_id"]
            })
            if not doc:
                state["error"] = "Candidate not found"
                return state
            
            state["resume_data"] = {
                "parsed": doc.get("parsedData", {}),
                "ats": doc.get("atsScores", {}),
                "fraud": doc.get("fraudAnalysis", {}),
                "interview": doc.get("interviewEvaluation", {}),
                "skillGraph": doc.get("skillGraph", {}),
                "successPrediction": doc.get("successPrediction", {})
            }
        except Exception as e:
            state["error"] = str(e)
            emit_socket_event("GRAPH_FAILED", {"resumeId": state["resume_id"]})
        return state

    async def _node_build_networks(self, state: KnowledgeGraphState) -> KnowledgeGraphState:
        if state.get("error"): return state
        emit_socket_event("GRAPH_ANALYZING", {"resumeId": state["resume_id"], "status": "Building Networks"})
        try:
            llm = LLMRouter.get_llm("extraction")
            chain = SKILL_NETWORK_PROMPT | llm | StrOutputParser()
            
            parsed = state["resume_data"].get("parsed", {})
            skills = parsed.get("skills", [])
            experience = json.dumps(parsed.get("experience", []))
            
            raw = await chain.ainvoke({"skills": skills, "experience": experience[:2000]})
            data = json.loads(clean_json_str(raw))
            
            state["connected_skills"] = data.get("connectedSkills", [])
            state["related_projects"] = data.get("relatedProjects", [])
        except Exception as e:
            logger.error(f"Network build error: {e}")
            state["connected_skills"] = []
            state["related_projects"] = []
        return state

    async def _node_detect_hidden_talents(self, state: KnowledgeGraphState) -> KnowledgeGraphState:
        if state.get("error"): return state
        emit_socket_event("GRAPH_ANALYZING", {"resumeId": state["resume_id"], "status": "Detecting Hidden Talents"})
        try:
            llm = LLMRouter.get_llm("reasoning")
            chain = HIDDEN_TALENT_PROMPT | llm | StrOutputParser()
            
            parsed = state["resume_data"].get("parsed", {})
            skills = parsed.get("skills", [])
            experience = json.dumps(parsed.get("experience", []))
            
            raw = await chain.ainvoke({"skills": skills, "experience": experience[:2000]})
            data = json.loads(clean_json_str(raw))
            
            state["hidden_talents"] = data.get("hiddenTalents", [])
            state["inferred_strengths"] = data.get("inferredStrengths", [])
        except Exception as e:
            logger.error(f"Hidden talent error: {e}")
            state["hidden_talents"] = []
            state["inferred_strengths"] = []
        return state

    async def _node_cluster_candidate(self, state: KnowledgeGraphState) -> KnowledgeGraphState:
        if state.get("error"): return state
        emit_socket_event("GRAPH_CLUSTERING", {"resumeId": state["resume_id"], "status": "Clustering Candidate"})
        try:
            llm = LLMRouter.get_llm("classification")
            chain = CLUSTER_PROMPT | llm | StrOutputParser()
            
            data_dump = json.dumps(state["resume_data"], default=str)[:3000]
            
            raw = await chain.ainvoke({"data": data_dump})
            data = json.loads(clean_json_str(raw))
            
            state["candidate_cluster"] = data.get("candidateCluster", "Full Stack Engineer")
        except Exception as e:
            logger.error(f"Clustering error: {e}")
            state["candidate_cluster"] = "Unknown"
        return state

    async def _node_find_similar_candidates(self, state: KnowledgeGraphState) -> KnowledgeGraphState:
        if state.get("error"): return state
        emit_socket_event("GRAPH_ANALYZING", {"resumeId": state["resume_id"], "status": "Finding Similar Candidates"})
        try:
            collection = get_mongo_collection()
            # Fetch up to 100 peers in the org to compare against
            peers = await collection.find({
                "organizationId": state["organization_id"],
                "_id": {"$ne": ObjectId(state["resume_id"])}
            }).to_list(length=100)
            
            base_ats = state["resume_data"].get("ats", {}).get("overall_score", 0)
            base_trust = state["resume_data"].get("fraud", {}).get("trustScore", 0)
            base_success = state["resume_data"].get("successPrediction", {}).get("successProbability", 0)
            base_skill = state["resume_data"].get("skillGraph", {}).get("overallTechnicalScore", 0)
            
            similar_candidates = []
            
            for peer in peers:
                peer_ats = peer.get("atsScores", {}).get("overall_score", 0)
                peer_trust = peer.get("fraudAnalysis", {}).get("trustScore", 0)
                peer_success = peer.get("successPrediction", {}).get("successProbability", 0)
                peer_skill = peer.get("skillGraph", {}).get("overallTechnicalScore", 0)
                
                # Simple distance-based similarity (0-100)
                ats_sim = 100 - abs(base_ats - peer_ats)
                trust_sim = 100 - abs(base_trust - peer_trust)
                success_sim = 100 - abs(base_success - peer_success)
                skill_sim = 100 - abs(base_skill - peer_skill)
                
                # Weighted: Skill Graph = 35%, Success = 20%, ATS = 15%, Trust = 10%, (Interview = 20% simplified into Skill here)
                # Normalizing the weights
                total_sim = (skill_sim * 0.55) + (success_sim * 0.20) + (ats_sim * 0.15) + (trust_sim * 0.10)
                
                if total_sim > 60:
                    similar_candidates.append({
                        "resumeId": str(peer["_id"]),
                        "similarityScore": round(total_sim, 1)
                    })
                    
            similar_candidates.sort(key=lambda x: x["similarityScore"], reverse=True)
            state["similar_candidates"] = similar_candidates[:10]
        except Exception as e:
            logger.error(f"Similar candidates error: {e}")
            state["similar_candidates"] = []
        return state

    async def _node_generate_graph_summary(self, state: KnowledgeGraphState) -> KnowledgeGraphState:
        if state.get("error"): return state
        try:
            # Graph Score based on interconnectedness, talents, and skills
            score = 50
            if state["candidate_cluster"] != "Unknown": score += 10
            score += len(state.get("hidden_talents", [])) * 2
            score += len(state.get("connected_skills", []))
            score += len(state.get("similar_candidates", []))
            
            # Incorporate base ats/skill
            base_skill = state["resume_data"].get("skillGraph", {}).get("overallTechnicalScore", 0)
            score += (base_skill * 0.2)
            
            state["graph_score"] = min(round(score), 100)
        except Exception as e:
            state["graph_score"] = 50
        return state

    async def _node_persist(self, state: KnowledgeGraphState) -> KnowledgeGraphState:
        if state.get("error"): return state
        emit_socket_event("GRAPH_ANALYZING", {"resumeId": state["resume_id"], "status": "Saving Knowledge Graph"})
        try:
            collection = get_mongo_collection()
            
            doc = {
                "candidateCluster": state.get("candidate_cluster", "Unknown"),
                "graphScore": state.get("graph_score", 0),
                "similarCandidates": state.get("similar_candidates", []),
                "connectedSkills": state.get("connected_skills", []),
                "relatedProjects": state.get("related_projects", []),
                "inferredStrengths": state.get("inferred_strengths", []),
                "hiddenTalents": state.get("hidden_talents", []),
                "generatedAt": datetime.datetime.utcnow().isoformat()
            }
            
            await collection.update_one(
                {"_id": ObjectId(state["resume_id"])},
                {"$set": {"knowledgeGraph": doc}}
            )
            emit_socket_event("GRAPH_COMPLETED", {"resumeId": state["resume_id"]})
        except Exception as e:
            state["error"] = str(e)
            emit_socket_event("GRAPH_FAILED", {"resumeId": state["resume_id"]})
        return state

    async def run(self, resume_id: str, organization_id: str) -> dict:
        initial_state = {
            "resume_id": resume_id,
            "organization_id": organization_id,
            "resume_data": None,
            "connected_skills": None,
            "related_projects": None,
            "hidden_talents": None,
            "inferred_strengths": None,
            "candidate_cluster": None,
            "similar_candidates": None,
            "graph_score": None,
            "error": None
        }
        final_state = await self._graph.ainvoke(initial_state)
        
        if final_state.get("error"):
            return {"error": final_state["error"]}
        
        return {
            "candidateCluster": final_state.get("candidate_cluster"),
            "graphScore": final_state.get("graph_score"),
            "hiddenTalents": final_state.get("hidden_talents")
        }
