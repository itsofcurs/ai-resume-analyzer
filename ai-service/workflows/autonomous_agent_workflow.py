"""
workflows/autonomous_agent_workflow.py
--------------------------------------
Background Orchestrator for Phase 4C Module 8.
Triggered on upload, pipeline stage change, or scorecard submission.
Precomputes ATS, Trust, Success, Risk, and JD Match asynchronously.
"""

import logging
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END
import json

from database import get_mongo_collection
from bson import ObjectId

# Import existing sub-workflows
from .resume_workflow import ResumeWorkflow
from .fraud_detection_workflow import FraudDetectionWorkflow
from .success_prediction_workflow import SuccessPredictionWorkflow
from .predictive_hiring_workflow import PredictiveHiringWorkflow
from .recommendation_workflow import RecommendationWorkflow

logger = logging.getLogger(__name__)

class BackgroundAgentState(TypedDict):
    resume_id: str
    organization_id: str
    job_id: Optional[str]
    trigger_event: str
    intermediate_results: dict
    error: Optional[str]

class AutonomousAgentWorkflow:
    def __init__(self):
        graph = StateGraph(BackgroundAgentState)

        graph.add_node("process_ats", self._node_process_ats)
        graph.add_node("process_fraud", self._node_process_fraud)
        graph.add_node("process_success", self._node_process_success)
        graph.add_node("process_risk", self._node_process_risk)
        graph.add_node("process_jd_match", self._node_process_jd_match)
        graph.add_node("finalize", self._node_finalize)

        graph.set_entry_point("process_ats")
        
        # Sequence: ATS -> Fraud -> Success -> Risk -> JD Match (if job_id) -> finalize
        graph.add_edge("process_ats", "process_fraud")
        graph.add_edge("process_fraud", "process_success")
        graph.add_edge("process_success", "process_risk")
        graph.add_edge("process_risk", "process_jd_match")
        graph.add_edge("process_jd_match", "finalize")
        graph.add_edge("finalize", END)

        self._graph = graph.compile()

    async def _node_process_ats(self, state: BackgroundAgentState) -> BackgroundAgentState:
        try:
            logger.info(f"[BACKGROUND AGENT] Running ATS Workflow for {state['resume_id']}")
            wf = ResumeWorkflow()
            await wf.run(state["resume_id"])
            state["intermediate_results"]["ats"] = "Completed"
        except Exception as e:
            logger.error(f"ATS error: {e}")
            state["error"] = str(e)
        return state

    async def _node_process_fraud(self, state: BackgroundAgentState) -> BackgroundAgentState:
        try:
            logger.info(f"[BACKGROUND AGENT] Running Fraud Workflow for {state['resume_id']}")
            wf = FraudDetectionWorkflow()
            await wf.run(state["resume_id"])
            state["intermediate_results"]["fraud"] = "Completed"
        except Exception as e:
            logger.error(f"Fraud error: {e}")
            state["error"] = str(e)
        return state

    async def _node_process_success(self, state: BackgroundAgentState) -> BackgroundAgentState:
        try:
            logger.info(f"[BACKGROUND AGENT] Running Success Workflow for {state['resume_id']}")
            wf = SuccessPredictionWorkflow()
            await wf.run(state["resume_id"])
            state["intermediate_results"]["success"] = "Completed"
        except Exception as e:
            logger.error(f"Success error: {e}")
            state["error"] = str(e)
        return state

    async def _node_process_risk(self, state: BackgroundAgentState) -> BackgroundAgentState:
        try:
            logger.info(f"[BACKGROUND AGENT] Running Predictive Risk Workflow for {state['resume_id']}")
            wf = PredictiveHiringWorkflow()
            await wf.run(state["resume_id"])
            state["intermediate_results"]["risk"] = "Completed"
        except Exception as e:
            logger.error(f"Risk error: {e}")
            state["error"] = str(e)
        return state

    async def _node_process_jd_match(self, state: BackgroundAgentState) -> BackgroundAgentState:
        try:
            if state.get("job_id"):
                logger.info(f"[BACKGROUND AGENT] Running JD Match Workflow for {state['resume_id']} vs {state['job_id']}")
                # In real scenario, fetch JD using job_id from Prisma, then run recommendation
                # Here we simulate the trigger since recommendation workflow takes job_description, not job_id directly yet
                from database import get_prisma_client
                prisma = await get_prisma_client()
                job = await prisma.jobdescription.find_unique(where={"id": state["job_id"], "organizationId": state["organization_id"]})
                if job:
                    wf = RecommendationWorkflow()
                    await wf.run(job.description, top_k=10) # Updates recommendationScore in Mongo
                    state["intermediate_results"]["jd_match"] = "Completed"
        except Exception as e:
            logger.error(f"JD Match error: {e}")
            state["error"] = str(e)
        return state

    async def _node_finalize(self, state: BackgroundAgentState) -> BackgroundAgentState:
        logger.info(f"[BACKGROUND AGENT] Finalizing background run for {state['resume_id']}")
        try:
            collection = get_mongo_collection()
            # Mark processing as fully complete
            await collection.update_one(
                {"_id": ObjectId(state["resume_id"])},
                {"$set": {"status": "PROCESSED"}}
            )
            state["intermediate_results"]["status"] = "PROCESSED"
        except Exception as e:
            logger.error(f"Finalize error: {e}")
        return state

    async def run(self, resume_id: str, organization_id: str, job_id: str = None, trigger_event: str = "upload") -> dict:
        state = {
            "resume_id": resume_id,
            "organization_id": organization_id,
            "job_id": job_id,
            "trigger_event": trigger_event,
            "intermediate_results": {},
            "error": None
        }
        final_state = await self._graph.ainvoke(state)
        return {"status": "completed", "results": final_state.get("intermediate_results"), "error": final_state.get("error")}
