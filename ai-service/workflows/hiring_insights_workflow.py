import logging
from typing import TypedDict, Dict, Any, List
from langgraph.graph import StateGraph, START, END
from services.gemini_service import GeminiService

logger = logging.getLogger(__name__)

class HiringInsightsState(TypedDict):
    organization_id: str
    aggregated_stats: Dict[str, Any]
    strengths: List[str]
    weaknesses: List[str]
    patterns: List[str]
    hiringRisks: List[str]
    recommendations: List[str]
    executiveSummary: str
    error: str

class HiringInsightsWorkflow:
    def __init__(self):
        self.gemini = GeminiService.get_instance()
        self.workflow = self._build_graph()

    def _build_graph(self) -> StateGraph:
        builder = StateGraph(HiringInsightsState)

        builder.add_node("load_metrics", self.load_metrics)
        builder.add_node("detect_bottlenecks", self.detect_bottlenecks)
        builder.add_node("detect_hiring_patterns", self.detect_hiring_patterns)
        builder.add_node("identify_skill_gaps", self.identify_skill_gaps)
        builder.add_node("predict_future_hiring_risks", self.predict_future_hiring_risks)
        builder.add_node("generate_recommendations", self.generate_recommendations)
        builder.add_node("generate_executive_summary", self.generate_executive_summary)

        builder.add_edge(START, "load_metrics")
        builder.add_edge("load_metrics", "detect_bottlenecks")
        builder.add_edge("detect_bottlenecks", "detect_hiring_patterns")
        builder.add_edge("detect_hiring_patterns", "identify_skill_gaps")
        builder.add_edge("identify_skill_gaps", "predict_future_hiring_risks")
        builder.add_edge("predict_future_hiring_risks", "generate_recommendations")
        builder.add_edge("generate_recommendations", "generate_executive_summary")
        builder.add_edge("generate_executive_summary", END)

        return builder.compile()

    def load_metrics(self, state: HiringInsightsState) -> Dict[str, Any]:
        # Metrics are injected at start
        return state

    async def detect_bottlenecks(self, state: HiringInsightsState) -> Dict[str, Any]:
        stats = state.get("aggregated_stats", {})
        prompt = f"Analyze these hiring metrics and identify any process bottlenecks or weaknesses: {stats}"
        try:
            res = await self.gemini.generate_text(prompt)
            # Simplistic parsing for demo
            lines = [l.strip("-* ") for l in res.split("\n") if len(l) > 10][:3]
            return {"weaknesses": lines}
        except Exception as e:
            return {"weaknesses": [f"Analysis error: {e}"]}

    async def detect_hiring_patterns(self, state: HiringInsightsState) -> Dict[str, Any]:
        stats = state.get("aggregated_stats", {})
        prompt = f"Identify 3 key positive patterns or strengths in these hiring metrics: {stats}"
        try:
            res = await self.gemini.generate_text(prompt)
            lines = [l.strip("-* ") for l in res.split("\n") if len(l) > 10][:3]
            return {"patterns": lines, "strengths": lines}
        except Exception as e:
            return {"patterns": []}

    async def identify_skill_gaps(self, state: HiringInsightsState) -> Dict[str, Any]:
        stats = state.get("aggregated_stats", {})
        prompt = f"Based on the following skill distribution data, identify critical missing skills or gaps: {stats.get('skills', {})}"
        try:
            res = await self.gemini.generate_text(prompt)
            return {"strengths": state.get("strengths", [])} # Dummy operation, handled mostly in backend now via aggregate
        except Exception:
            return {}

    async def predict_future_hiring_risks(self, state: HiringInsightsState) -> Dict[str, Any]:
        stats = state.get("aggregated_stats", {})
        prompt = f"Predict 3 future hiring risks based on this candidate pipeline data: {stats}"
        try:
            res = await self.gemini.generate_text(prompt)
            lines = [l.strip("-* ") for l in res.split("\n") if len(l) > 10][:3]
            return {"hiringRisks": lines}
        except Exception:
            return {"hiringRisks": ["Unable to predict risks"]}

    async def generate_recommendations(self, state: HiringInsightsState) -> Dict[str, Any]:
        prompt = f"Given weaknesses: {state.get('weaknesses')} and risks: {state.get('hiringRisks')}, provide 3 actionable recruiter recommendations."
        try:
            res = await self.gemini.generate_text(prompt)
            lines = [l.strip("-* ") for l in res.split("\n") if len(l) > 10][:3]
            return {"recommendations": lines}
        except Exception:
            return {"recommendations": []}

    async def generate_executive_summary(self, state: HiringInsightsState) -> Dict[str, Any]:
        prompt = f"Write a 3 sentence executive summary for the VP of Talent Acquisition summarizing these findings: {state}"
        try:
            res = await self.gemini.generate_text(prompt)
            return {"executiveSummary": res}
        except Exception:
            return {"executiveSummary": "Summary generation failed."}

    async def run(self, organization_id: str, aggregated_stats: Dict[str, Any]) -> Dict[str, Any]:
        try:
            initial_state = HiringInsightsState(
                organization_id=organization_id,
                aggregated_stats=aggregated_stats,
                strengths=[],
                weaknesses=[],
                patterns=[],
                hiringRisks=[],
                recommendations=[],
                executiveSummary="",
                error=""
            )
            result = await self.workflow.ainvoke(initial_state)
            return {
                "strengths": result.get("strengths"),
                "weaknesses": result.get("weaknesses"),
                "patterns": result.get("patterns"),
                "hiringRisks": result.get("hiringRisks"),
                "recommendations": result.get("recommendations"),
                "executiveSummary": result.get("executiveSummary")
            }
        except Exception as e:
            logger.error(f"HiringInsightsWorkflow error: {e}")
            return {"error": str(e)}
