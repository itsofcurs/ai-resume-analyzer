"""
services/candidate_ranker.py
----------------------------
Deterministic candidate ranking and shortlist labeling.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from schemas.job_match_schema import FinalATSAnalysisSchema
from schemas.ranking_schema import CandidateRankingItemSchema


@dataclass(frozen=True)
class RankingThresholds:
    strong_match: int = 85
    good_match: int = 70
    borderline: int = 55

    def __post_init__(self) -> None:
        if not (
            0 <= self.borderline <= 100
            and 0 <= self.good_match <= 100
            and 0 <= self.strong_match <= 100
        ):
            raise ValueError("Ranking thresholds must be within 0-100.")
        if not (self.strong_match >= self.good_match >= self.borderline):
            raise ValueError("Ranking thresholds must be in descending order.")


@dataclass(frozen=True)
class CandidateRankingInput:
    candidate_id: str
    candidate_name: str
    analysis: FinalATSAnalysisSchema


class CandidateRanker:
    """
    Aggregates ATS outputs into deterministic ranked lists with shortlist labels.
    """

    def __init__(self, thresholds: RankingThresholds | None = None) -> None:
        self._thresholds = thresholds or RankingThresholds()

    @property
    def thresholds(self) -> RankingThresholds:
        return self._thresholds

    def label_for_score(self, score: int) -> str:
        score = self._clamp_score(score)
        if score >= self._thresholds.strong_match:
            return "STRONG_MATCH"
        if score >= self._thresholds.good_match:
            return "GOOD_MATCH"
        if score >= self._thresholds.borderline:
            return "BORDERLINE"
        return "REJECT"

    def rank(
        self,
        candidates: Sequence[CandidateRankingInput],
    ) -> tuple[list[CandidateRankingItemSchema], dict]:
        """
        Rank candidates by final ATS score with deterministic tie-breaking.
        """
        ranked_inputs = sorted(candidates, key=self._sort_key)

        ranked_items: list[CandidateRankingItemSchema] = []
        for idx, item in enumerate(ranked_inputs, start=1):
            analysis = item.analysis
            ranked_items.append(
                CandidateRankingItemSchema(
                    candidate_id=item.candidate_id,
                    candidate_name=item.candidate_name,
                    final_ats_score=self._clamp_score(analysis.final_ats_score),
                    rule_score=self._clamp_score(analysis.rule_score),
                    embedding_score=self._clamp_score(analysis.embedding_score),
                    llm_confidence_score=self._clamp_score(
                        analysis.llm_confidence_score
                    ),
                    strengths=list(analysis.reasoning.strengths or []),
                    weaknesses=list(analysis.reasoning.weaknesses or []),
                    recommendation=analysis.reasoning.recommendation,
                    shortlist_label=self.label_for_score(analysis.final_ats_score),
                    rank_position=idx,
                    semantic_alignment=analysis.embedding_breakdown.semantic_alignment,
                    matched_required_skills=list(
                        analysis.rule_breakdown.matched_required_skills or []
                    ),
                    missing_required_skills=list(
                        analysis.rule_breakdown.missing_required_skills or []
                    ),
                )
            )

        trace = {
            "thresholds": {
                "strong_match": self._thresholds.strong_match,
                "good_match": self._thresholds.good_match,
                "borderline": self._thresholds.borderline,
            },
            "tie_breaker_order": [
                "final_ats_score",
                "rule_score",
                "embedding_score",
                "llm_confidence_score",
                "candidate_name",
                "candidate_id",
            ],
        }
        return ranked_items, trace

    def shortlist(
        self,
        ranked: Sequence[CandidateRankingItemSchema],
        top_k: int,
    ) -> list[CandidateRankingItemSchema]:
        if top_k <= 0:
            return []
        return list(ranked[:top_k])

    def _sort_key(self, item: CandidateRankingInput) -> tuple:
        analysis = item.analysis
        return (
            -self._clamp_score(analysis.final_ats_score),
            -self._clamp_score(analysis.rule_score),
            -self._clamp_score(analysis.embedding_score),
            -self._clamp_score(analysis.llm_confidence_score),
            (item.candidate_name or "").strip().lower(),
            (item.candidate_id or "").strip().lower(),
        )

    @staticmethod
    def _clamp_score(score: int) -> int:
        try:
            return max(0, min(100, int(score)))
        except (TypeError, ValueError):
            return 0
