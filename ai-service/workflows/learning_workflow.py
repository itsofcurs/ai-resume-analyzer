import json
import logging
from typing import Any, Dict

from database import get_mongo_collection
from langgraph.graph import END, StateGraph
from pydantic import BaseModel
from services.gemini_service import GeminiService

logger = logging.getLogger(__name__)


class LearningState(BaseModel):
    outcome_payload: Dict[str, Any]
    calibration_adjustment: float = 0.0
    accuracy_metrics: Dict[str, Any] = {}
    alignment_metrics: Dict[str, Any] = {}
    error: str = ""


class HiringOutcomeWorkflow:
    def __init__(self):
        self.gemini = GeminiService()
        self.graph = self._build_graph()

    def _build_graph(self):
        workflow = StateGraph(LearningState)

        workflow.add_node("analyze_outcome", self.analyze_outcome)
        workflow.add_node("persist_learning", self.persist_learning)

        workflow.set_entry_point("analyze_outcome")
        workflow.add_edge("analyze_outcome", "persist_learning")
        workflow.add_edge("persist_learning", END)

        return workflow.compile()

    def analyze_outcome(self, state: LearningState):
        logger.info("Analyzing hiring outcome for continuous learning")
        prompt = f"""
        You are the Continuous Learning Pipeline for a Recruitment AI.
        Analyze the actual hiring outcome against the initial AI recommendation.
        
        Outcome Payload: {json.dumps(state.outcome_payload, indent=2)}
        
        Determine the calibration adjustments required for future AI models to improve accuracy.
        
        Return ONLY valid JSON with this exact schema:
        {{
            "calibrationAdjustment": <float between -1.0 and 1.0 (positive if AI was right, negative if AI was wrong)>,
            "accuracyMetrics": {{
                "predictedOutcome": "<string>",
                "actualOutcome": "<string>",
                "delta": <float>
            }},
            "alignmentMetrics": {{
                "recruiterAgreement": <float 0.0 to 1.0>,
                "biasCorrection": "<string summarizing any identified bias>"
            }}
        }}
        """

        try:
            response_text = self.gemini.generate_content(prompt)
            if "```json" in response_text:
                response_text = (
                    response_text.split("```json")[1].split("```")[0].strip()
                )
            elif "```" in response_text:
                response_text = response_text.split("```")[1].strip()

            data = json.loads(response_text)

            state.calibration_adjustment = data.get("calibrationAdjustment", 0.0)
            state.accuracy_metrics = data.get("accuracyMetrics", {})
            state.alignment_metrics = data.get("alignmentMetrics", {})
        except Exception as e:
            logger.error(f"Failed to analyze outcome: {e}")
            state.error = str(e)

        return state

    def persist_learning(self, state: LearningState):
        if state.error:
            return state

        try:
            mongo_coll = get_mongo_collection("learning_metrics")
            doc = {
                "organization_id": state.outcome_payload.get("organizationId"),
                "candidate_id": state.outcome_payload.get("candidateId"),
                "recruiter_id": state.outcome_payload.get("recruiterId"),
                "outcome": state.outcome_payload.get("outcome"),
                "calibration_adjustment": state.calibration_adjustment,
                "accuracy_metrics": state.accuracy_metrics,
                "alignment_metrics": state.alignment_metrics,
                "timestamp": __import__("time").time(),
            }
            mongo_coll.insert_one(doc)
            logger.info("Persisted learning outcome successfully.")
        except Exception as e:
            logger.error(f"MongoDB learning persistence failed: {e}")
            state.error = str(e)

        return state

    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        initial_state = LearningState(outcome_payload=payload)

        try:
            final_state = self.graph.invoke(initial_state)
            return {
                "calibrationAdjustment": final_state.get("calibration_adjustment", 0.0),
                "accuracyMetrics": final_state.get("accuracy_metrics", {}),
                "alignmentMetrics": final_state.get("alignment_metrics", {}),
                "error": final_state.get("error", ""),
            }
        except Exception as e:
            logger.error(f"LearningWorkflow failed: {str(e)}")
            return {"error": str(e)}
