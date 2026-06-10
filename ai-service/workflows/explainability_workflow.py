import json
import logging
from typing import Dict, Any, List
from pydantic import BaseModel
from langgraph.graph import StateGraph, END
from services.gemini_service import GeminiService
import traceback

logger = logging.getLogger(__name__)

class ExplainabilityState(BaseModel):
    recommendation_payload: Dict[str, Any]
    confidence: float = 0.0
    reasoning: str = ""
    contributing_factors: List[Dict[str, Any]] = []
    negative_factors: List[Dict[str, Any]] = []
    audit_trail: List[str] = []
    error: str = ""

class ExplainabilityWorkflow:
    def __init__(self):
        self.gemini = GeminiService()
        self.graph = self._build_graph()
        
    def _build_graph(self):
        workflow = StateGraph(ExplainabilityState)
        
        workflow.add_node("analyze_recommendation", self.analyze_recommendation)
        workflow.add_node("generate_audit_trail", self.generate_audit_trail)
        
        workflow.set_entry_point("analyze_recommendation")
        workflow.add_edge("analyze_recommendation", "generate_audit_trail")
        workflow.add_edge("generate_audit_trail", END)
        
        return workflow.compile()
        
    def analyze_recommendation(self, state: ExplainabilityState):
        logger.info("Analyzing recommendation for explainability")
        prompt = f"""
        You are an AI governance and explainability engine. Analyze the following AI recommendation payload
        and decompose it into deterministic human-readable factors.
        
        Payload: {json.dumps(state.recommendation_payload, indent=2)}
        
        Return ONLY valid JSON with this exact schema:
        {{
            "confidence": <float 0.0 to 1.0>,
            "reasoning": "<string summarizing why this decision was made>",
            "contributingFactors": [
                {{"factor": "<string>", "weight": <float>, "evidence": "<string>"}}
            ],
            "negativeFactors": [
                {{"factor": "<string>", "weight": <float>, "evidence": "<string>"}}
            ]
        }}
        """
        
        try:
            response_text = self.gemini.generate_content(prompt)
            # Remove markdown formatting if present
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].strip()
                
            data = json.loads(response_text)
            
            state.confidence = data.get("confidence", 0.0)
            state.reasoning = data.get("reasoning", "")
            state.contributing_factors = data.get("contributingFactors", [])
            state.negative_factors = data.get("negativeFactors", [])
        except Exception as e:
            logger.error(f"Failed to analyze recommendation: {e}")
            state.error = str(e)
            
        return state
        
    def generate_audit_trail(self, state: ExplainabilityState):
        # Generate deterministic chronological audit trail based on factors
        audit_trail = [
            f"SYSTEM_INIT: Recommendation payload received for decomposition.",
            f"ANALYSIS: Evaluated {len(state.contributing_factors)} positive factors and {len(state.negative_factors)} negative factors."
        ]
        
        for p in state.contributing_factors:
            audit_trail.append(f"FACTOR_EVAL (POS): Analyzed {p.get('factor')} (weight: {p.get('weight')}) -> {p.get('evidence')}")
            
        for n in state.negative_factors:
            audit_trail.append(f"FACTOR_EVAL (NEG): Analyzed {n.get('factor')} (weight: {n.get('weight')}) -> {n.get('evidence')}")
            
        audit_trail.append(f"DECISION_FORMULATION: Computed confidence score of {state.confidence:.2f}.")
        audit_trail.append(f"REASONING_SYNTHESIS: {state.reasoning}")
        
        state.audit_trail = audit_trail
        return state

    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        initial_state = ExplainabilityState(recommendation_payload=payload)
        
        try:
            final_state = self.graph.invoke(initial_state)
            return {
                "confidence": final_state.get("confidence", 0.0),
                "reasoning": final_state.get("reasoning", ""),
                "contributingFactors": final_state.get("contributing_factors", []),
                "negativeFactors": final_state.get("negative_factors", []),
                "auditTrail": final_state.get("audit_trail", []),
                "error": final_state.get("error", "")
            }
        except Exception as e:
            logger.error(f"ExplainabilityWorkflow failed: {traceback.format_exc()}")
            return {"error": str(e)}
