"""
workflows/batch_job_match_workflow.py
------------------------------------
LangGraph-powered batch orchestration for multi-candidate ranking.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
import uuid
from typing import Any, Iterable, Optional, TypedDict

from agents.ats_scorer import ATSScoringAgent
from agents.resume_parser import ResumeParserAgent
from langgraph.graph import END, StateGraph
from schemas.job_match_schema import ATSWeightsSchema, FinalATSAnalysisSchema
from schemas.ranking_schema import (
    BatchProcessingSummarySchema,
    BatchRankingRequestSchema,
    BatchRankingResponseSchema,
    CandidateRankingItemSchema,
)
from schemas.recruiter_analytics_schema import (
    CandidateSummarySchema,
    RecruiterAnalyticsSchema,
    SkillGapSummarySchema,
)
from schemas.resume_schema import ResumeParseResponse
from services.cache_service import cache_service
from services.candidate_ranker import CandidateRanker, CandidateRankingInput
from services.workflow_event_service import WorkflowEventService, workflow_event_service

logger = logging.getLogger(__name__)

GRAPH_ID = "batch_job_match_graph_v1"


class CandidateState(TypedDict, total=False):
    candidate_id: str
    candidate_name: str
    resume_text: str
    parsed_resume: ResumeParseResponse
    analysis: FinalATSAnalysisSchema
    errors: list[str]
    failed: bool
    node_timings_ms: dict[str, int]
    failed_nodes: list[str]
    retry_counts: dict[str, int]
    shortlist_label: str


class BatchState(TypedDict, total=False):
    workflow_id: str
    graph_id: str
    request_id: Optional[str]
    candidates: list[CandidateState]
    job_description_text: str
    required_skills: list[str]
    preferred_skills: list[str]
    weights: ATSWeightsSchema
    top_k: int
    ranked_candidates: list[CandidateRankingItemSchema]
    shortlisted_candidates: list[CandidateRankingItemSchema]
    processing_summary: BatchProcessingSummarySchema
    processing_time_ms: int
    node_timings_ms: dict[str, int]
    failed_candidates: list[str]
    ranking_trace: dict[str, Any]
    memory: dict[str, Any]
    start_time: float


class BatchJobMatchWorkflow:
    """
    Batch workflow that orchestrates parsing, hybrid ATS scoring, and ranking.
    """

    def __init__(
        self,
        *,
        ats_agent: Optional[ATSScoringAgent] = None,
        parser_agent: Optional[ResumeParserAgent] = None,
        ranker: Optional[CandidateRanker] = None,
        event_service: Optional[WorkflowEventService] = None,
        max_concurrency: Optional[int] = None,
        max_retries: int = 1,
        parse_timeout_s: Optional[float] = None,
        score_timeout_s: Optional[float] = None,
    ) -> None:
        from core.config import get_settings

        settings = get_settings()
        self._ats_agent = ats_agent or ATSScoringAgent()
        self._parser = parser_agent or ResumeParserAgent()
        self._ranker = ranker or CandidateRanker()
        self._event_service = event_service or workflow_event_service
        concurrency = (
            max_concurrency
            if max_concurrency is not None
            else settings.max_batch_concurrency
        )
        self._max_concurrency = max(1, int(concurrency))
        self._max_retries = max(0, int(max_retries))
        parse_timeout = (
            parse_timeout_s
            if parse_timeout_s is not None
            else settings.batch_parse_timeout_s
        )
        score_timeout = (
            score_timeout_s
            if score_timeout_s is not None
            else settings.batch_score_timeout_s
        )
        # Allow sub-second timeouts for tight SLOs and unit tests.
        # Hard floor avoids accidental zero/negative timeouts.
        self._parse_timeout_s = max(0.05, float(parse_timeout))
        self._score_timeout_s = max(0.05, float(score_timeout))
        self._graph = self._build_graph()

    async def run(
        self,
        req: BatchRankingRequestSchema,
        *,
        request_id: Optional[str] = None,
    ) -> BatchRankingResponseSchema:
        workflow_id = f"wf_{uuid.uuid4().hex}"
        start_time = time.perf_counter()

        candidates: list[CandidateState] = [
            {
                "candidate_id": r.candidate_id,
                "candidate_name": r.candidate_name,
                "resume_text": r.resume_text,
                "errors": [],
                "failed": False,
                "node_timings_ms": {},
                "failed_nodes": [],
                "retry_counts": {},
            }
            for r in req.resumes
        ]

        initial_state: BatchState = {
            "workflow_id": workflow_id,
            "graph_id": GRAPH_ID,
            "request_id": request_id,
            "candidates": candidates,
            "job_description_text": req.job_description_text,
            "required_skills": req.required_skills,
            "preferred_skills": req.preferred_skills,
            "weights": req.weights or ATSWeightsSchema(),
            "top_k": min(req.top_k, len(candidates)),
            "node_timings_ms": {},
            "ranking_trace": {},
            "memory": {},
            "start_time": start_time,
        }

        self._emit_state(initial_state, "queued", "Batch request queued")

        logger.info(
            "BatchJobMatchWorkflow: starting batch run workflow_id=%s candidates=%d",
            workflow_id,
            len(candidates),
        )

        final_state: BatchState = await self._graph.ainvoke(initial_state)

        processing_time_ms = int((time.perf_counter() - start_time) * 1000)
        final_state["processing_time_ms"] = processing_time_ms
        if final_state.get("processing_summary"):
            final_state["processing_summary"].processing_latency_ms = processing_time_ms
            final_state["processing_summary"].node_timings_ms[
                "total_ms"
            ] = processing_time_ms
            if (
                final_state.get("processing_summary").failed_candidates
                and len(final_state.get("ranked_candidates", [])) == 0
            ):
                self._emit_state(
                    final_state,
                    "failed",
                    "Batch completed with no successful candidates",
                )
            else:
                self._emit_state(final_state, "completed", "Batch completed")

        return BatchRankingResponseSchema(
            ranked_candidates=final_state.get("ranked_candidates", []),
            shortlisted_candidates=final_state.get("shortlisted_candidates", []),
            processing_summary=final_state.get("processing_summary")
            or BatchProcessingSummarySchema(),
            processing_time_ms=final_state.get("processing_time_ms", 0),
            total_candidates=len(candidates),
        )

    # ------------------------------------------------------------------
    # LangGraph definition
    # ------------------------------------------------------------------

    def _build_graph(self):
        graph = StateGraph(BatchState)
        graph.add_node("parse_resume", self._node_parse_resume)
        graph.add_node("hybrid_ats_score", self._node_hybrid_ats_score)
        graph.add_node("rank_candidate", self._node_rank_candidate)
        graph.add_node("aggregate_results", self._node_aggregate_results)
        graph.add_node("shortlist_candidates", self._node_shortlist_candidates)

        graph.set_entry_point("parse_resume")
        graph.add_edge("parse_resume", "hybrid_ats_score")
        graph.add_edge("hybrid_ats_score", "rank_candidate")
        graph.add_edge("rank_candidate", "aggregate_results")
        graph.add_edge("aggregate_results", "shortlist_candidates")
        graph.add_edge("shortlist_candidates", END)
        return graph.compile()

    # ------------------------------------------------------------------
    # Graph nodes
    # ------------------------------------------------------------------

    async def _node_parse_resume(self, state: BatchState) -> BatchState:
        self._emit_state(state, "parsing", "Parsing resumes")
        candidates = state.get("candidates", [])

        async def _parse(candidate: CandidateState) -> CandidateState:
            if candidate.get("failed"):
                return candidate
            resume_text = (candidate.get("resume_text") or "").strip()
            if len(resume_text) < 20:
                self._mark_failed(
                    candidate, "parse_resume", "resume_text too short or empty"
                )
                return candidate

            cached = cache_service.get_cached_resume(resume_text)
            if cached is not None:
                candidate["parsed_resume"] = cached
                candidate["node_timings_ms"]["parse_resume"] = 0
                return candidate

            start = time.perf_counter()
            parsed = await self._run_with_retries(
                candidate,
                "parse_resume",
                lambda: self._parser.aparse(resume_text),
                timeout_s=self._parse_timeout_s,
            )
            if parsed is None:
                return candidate

            candidate["parsed_resume"] = parsed
            candidate["node_timings_ms"]["parse_resume"] = int(
                (time.perf_counter() - start) * 1000
            )
            cache_service.set_cached_resume(resume_text, parsed)
            return candidate

        await self._run_parallel(candidates, _parse)
        state["node_timings_ms"]["parse_resume"] = self._sum_node_timings(
            candidates, "parse_resume"
        )
        return state

    async def _node_hybrid_ats_score(self, state: BatchState) -> BatchState:
        self._emit_state(state, "scoring", "Scoring resumes")
        candidates = state.get("candidates", [])
        weights = state.get("weights", ATSWeightsSchema())

        async def _score(candidate: CandidateState) -> CandidateState:
            if candidate.get("failed"):
                return candidate
            parsed = candidate.get("parsed_resume")
            if parsed is None:
                self._mark_failed(
                    candidate, "hybrid_ats_score", "parsed_resume missing"
                )
                return candidate

            start = time.perf_counter()
            analysis = await self._run_with_retries(
                candidate,
                "hybrid_ats_score",
                lambda: self._ats_agent.analyze_with_parsed(
                    resume_text=candidate.get("resume_text", ""),
                    parsed_resume=parsed,
                    job_description_text=state.get("job_description_text", ""),
                    required_skills=state.get("required_skills", []),
                    preferred_skills=state.get("preferred_skills", []),
                    weights=weights,
                    parse_ms=candidate.get("node_timings_ms", {}).get("parse_resume"),
                ),
                timeout_s=self._score_timeout_s,
            )
            if analysis is None:
                return candidate

            candidate["analysis"] = analysis
            candidate["node_timings_ms"]["hybrid_ats_score"] = int(
                (time.perf_counter() - start) * 1000
            )
            candidate["resume_text"] = ""
            return candidate

        await self._run_parallel(candidates, _score)
        state["node_timings_ms"]["hybrid_ats_score"] = self._sum_node_timings(
            candidates, "hybrid_ats_score"
        )
        return state

    async def _node_rank_candidate(self, state: BatchState) -> BatchState:
        self._emit_state(state, "ranking", "Assigning shortlist labels")
        start = time.perf_counter()
        for candidate in state.get("candidates", []):
            analysis = candidate.get("analysis")
            if analysis is None:
                continue
            candidate["shortlist_label"] = self._ranker.label_for_score(
                analysis.final_ats_score
            )
        state["node_timings_ms"]["rank_candidate"] = int(
            (time.perf_counter() - start) * 1000
        )
        return state

    async def _node_aggregate_results(self, state: BatchState) -> BatchState:
        self._emit_state(state, "aggregating", "Aggregating batch results")
        start = time.perf_counter()
        inputs: list[CandidateRankingInput] = []
        for candidate in state.get("candidates", []):
            analysis = candidate.get("analysis")
            if analysis is None:
                continue
            inputs.append(
                CandidateRankingInput(
                    candidate_id=candidate.get("candidate_id", ""),
                    candidate_name=candidate.get("candidate_name", "Unknown Candidate"),
                    analysis=analysis,
                )
            )

        ranked, trace = self._ranker.rank(inputs)
        state["ranked_candidates"] = ranked
        state["ranking_trace"] = trace
        state["node_timings_ms"]["aggregate_results"] = int(
            (time.perf_counter() - start) * 1000
        )
        return state

    async def _node_shortlist_candidates(self, state: BatchState) -> BatchState:
        start = time.perf_counter()
        ranked = state.get("ranked_candidates", [])
        top_k = min(state.get("top_k", len(ranked)), len(ranked))
        state["shortlisted_candidates"] = self._ranker.shortlist(ranked, top_k)

        processing_summary = self._build_processing_summary(state, ranked)
        state["processing_summary"] = processing_summary
        state["node_timings_ms"]["shortlist_candidates"] = int(
            (time.perf_counter() - start) * 1000
        )
        return state

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _run_parallel(
        self,
        candidates: Iterable[CandidateState],
        fn,
    ) -> None:
        semaphore = asyncio.Semaphore(self._max_concurrency)

        async def _wrapped(candidate: CandidateState):
            async with semaphore:
                try:
                    return await fn(candidate)
                except asyncio.CancelledError:
                    self._mark_failed(
                        candidate, "cancelled", "candidate processing cancelled"
                    )
                    return candidate
                except Exception as exc:
                    self._mark_failed(candidate, "processing_error", str(exc))
                    return candidate

        await asyncio.gather(*[_wrapped(c) for c in candidates], return_exceptions=True)

    async def _run_with_retries(
        self,
        candidate: CandidateState,
        node_name: str,
        fn,
        *,
        timeout_s: Optional[float] = None,
    ):
        attempts = 0
        while True:
            try:
                if timeout_s:
                    return await asyncio.wait_for(fn(), timeout=timeout_s)
                return await fn()
            except asyncio.TimeoutError:
                attempts += 1
                candidate.setdefault("retry_counts", {})[node_name] = attempts
                self._track_failed_node(candidate, node_name)
                if attempts > self._max_retries:
                    self._mark_failed(candidate, node_name, "timeout")
                    return None
            except Exception as exc:
                attempts += 1
                candidate.setdefault("retry_counts", {})[node_name] = attempts
                self._track_failed_node(candidate, node_name)
                if attempts > self._max_retries:
                    self._mark_failed(candidate, node_name, str(exc))
                    return None

    @staticmethod
    def _mark_failed(candidate: CandidateState, node_name: str, reason: str) -> None:
        candidate["failed"] = True
        candidate.setdefault("errors", []).append(f"{node_name}: {reason}")
        BatchJobMatchWorkflow._track_failed_node(candidate, node_name)

    @staticmethod
    def _track_failed_node(candidate: CandidateState, node_name: str) -> None:
        failed_nodes = candidate.setdefault("failed_nodes", [])
        if node_name not in failed_nodes:
            failed_nodes.append(node_name)

    @staticmethod
    def _sum_node_timings(candidates: Iterable[CandidateState], node_name: str) -> int:
        total = 0
        for candidate in candidates:
            total += candidate.get("node_timings_ms", {}).get(node_name, 0)
        return total

    def _build_processing_summary(
        self,
        state: BatchState,
        ranked: list[CandidateRankingItemSchema],
    ) -> BatchProcessingSummarySchema:
        avg_score = 0.0
        if ranked:
            avg_score = round(sum(c.final_ats_score for c in ranked) / len(ranked), 2)

        strongest = ranked[0] if ranked else None
        weakest = ranked[-1] if ranked else None

        skill_gap_counts: dict[str, int] = {}
        for candidate in ranked:
            for skill in candidate.missing_required_skills:
                key = str(skill).strip().lower()
                if not key:
                    continue
                skill_gap_counts[key] = skill_gap_counts.get(key, 0) + 1

        top_skill_gaps = [
            SkillGapSummarySchema(skill=skill, count=count)
            for skill, count in sorted(
                skill_gap_counts.items(), key=lambda x: (-x[1], x[0])
            )[:5]
        ]

        semantic_distribution = self._semantic_distribution(ranked)
        semantic_alignment_avg = self._average([c.embedding_score for c in ranked])
        shortlist_counts = self._shortlist_counts(ranked)
        percentile_distribution = self._percentiles([c.final_ats_score for c in ranked])

        failed_candidates = [
            c.get("candidate_id", "")
            for c in state.get("candidates", [])
            if c.get("failed")
        ]

        node_timings_ms = dict(state.get("node_timings_ms", {}))
        node_timings_ms["total_ms"] = int(
            (time.perf_counter() - state.get("start_time", time.perf_counter())) * 1000
        )

        failed_nodes = self._aggregate_failed_nodes(state.get("candidates", []))
        retry_counts = self._aggregate_retry_counts(state.get("candidates", []))

        trace = dict(state.get("ranking_trace", {}))
        weights = state.get("weights")
        if weights:
            trace["weights"] = weights.model_dump()
        trace["top_k"] = state.get("top_k", 0)
        trace["total_candidates"] = len(state.get("candidates", []))

        recruiter_analytics = RecruiterAnalyticsSchema(
            average_ats_score=avg_score,
            percentile_distribution=percentile_distribution,
            strongest_candidate=self._candidate_summary(strongest),
            weakest_candidate=self._candidate_summary(weakest),
            top_missing_skills=top_skill_gaps,
            semantic_alignment_average=semantic_alignment_avg,
            shortlist_counts=shortlist_counts,
        )

        return BatchProcessingSummarySchema(
            average_ats_score=avg_score,
            top_skill_gaps=top_skill_gaps,
            strongest_candidate=self._candidate_summary(strongest),
            weakest_candidate=self._candidate_summary(weakest),
            processing_latency_ms=node_timings_ms.get("total_ms", 0),
            semantic_match_distribution=semantic_distribution,
            recruiter_analytics=recruiter_analytics,
            failed_candidates=failed_candidates,
            workflow_id=state.get("workflow_id"),
            graph_id=state.get("graph_id"),
            node_timings_ms=node_timings_ms,
            failed_nodes=failed_nodes,
            retry_counts=retry_counts,
            ranking_trace=trace,
        )

    @staticmethod
    def _candidate_summary(
        candidate: Optional[CandidateRankingItemSchema],
    ) -> Optional[CandidateSummarySchema]:
        if candidate is None:
            return None
        return CandidateSummarySchema(
            candidate_id=candidate.candidate_id,
            candidate_name=candidate.candidate_name,
            final_ats_score=candidate.final_ats_score,
        )

    @staticmethod
    def _semantic_distribution(
        ranked: list[CandidateRankingItemSchema],
    ) -> dict[str, int]:
        buckets = {"0-39": 0, "40-59": 0, "60-79": 0, "80-100": 0}
        for candidate in ranked:
            score = candidate.embedding_score
            if score >= 80:
                buckets["80-100"] += 1
            elif score >= 60:
                buckets["60-79"] += 1
            elif score >= 40:
                buckets["40-59"] += 1
            else:
                buckets["0-39"] += 1
        return buckets

    @staticmethod
    def _aggregate_failed_nodes(candidates: Iterable[CandidateState]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for candidate in candidates:
            for node_name in candidate.get("failed_nodes", []):
                counts[node_name] = counts.get(node_name, 0) + 1
        return counts

    @staticmethod
    def _aggregate_retry_counts(candidates: Iterable[CandidateState]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for candidate in candidates:
            for node_name, count in candidate.get("retry_counts", {}).items():
                counts[node_name] = counts.get(node_name, 0) + int(count)
        return counts

    @staticmethod
    def _average(values: list[int]) -> float:
        if not values:
            return 0.0
        return round(sum(values) / len(values), 2)

    @staticmethod
    def _percentiles(values: list[int]) -> dict[str, float]:
        if not values:
            return {}
        sorted_vals = sorted(values)
        return {
            "p25": BatchJobMatchWorkflow._percentile(sorted_vals, 25),
            "p50": BatchJobMatchWorkflow._percentile(sorted_vals, 50),
            "p75": BatchJobMatchWorkflow._percentile(sorted_vals, 75),
            "p90": BatchJobMatchWorkflow._percentile(sorted_vals, 90),
        }

    @staticmethod
    def _percentile(sorted_vals: list[int], percentile: int) -> float:
        if not sorted_vals:
            return 0.0
        if percentile <= 0:
            return float(sorted_vals[0])
        if percentile >= 100:
            return float(sorted_vals[-1])
        k = (len(sorted_vals) - 1) * (percentile / 100.0)
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return float(sorted_vals[int(k)])
        return round(sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f), 2)

    @staticmethod
    def _shortlist_counts(ranked: list[CandidateRankingItemSchema]) -> dict[str, int]:
        counts = {"STRONG_MATCH": 0, "GOOD_MATCH": 0, "BORDERLINE": 0, "REJECT": 0}
        for candidate in ranked:
            label = candidate.shortlist_label
            counts[label] = counts.get(label, 0) + 1
        return counts

    def _emit_state(self, state: BatchState, new_state: str, message: str) -> None:
        if self._event_service is None:
            return
        memory = state.setdefault("memory", {})
        if memory.get("last_state") == new_state:
            return
        memory["last_state"] = new_state
        self._event_service.emit(
            workflow_id=state.get("workflow_id", ""),
            request_id=state.get("request_id"),
            state=new_state,
            message=message,
            metadata={"graph_id": state.get("graph_id")},
        )
