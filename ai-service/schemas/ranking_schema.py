"""
schemas/ranking_schema.py
-------------------------
Batch ranking schemas for multi-candidate recruiter workflows.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from schemas.job_match_schema import (
    ATSWeightsSchema,
    MAX_JD_TEXT_CHARS,
    MAX_LIST_ITEMS,
    MAX_RESUME_TEXT_CHARS,
    MAX_TOKEN_LENGTH,
    _normalise_token,
)
from schemas.recruiter_analytics_schema import (
    CandidateSummarySchema,
    RecruiterAnalyticsSchema,
    SkillGapSummarySchema,
)

MAX_BATCH_RESUMES: int = 200


class BatchResumeSchema(BaseModel):
    model_config = {"extra": "forbid"}
    candidate_id: str = Field(min_length=1, description="Unique candidate identifier.")
    candidate_name: str = Field(min_length=1, description="Candidate display name.")
    resume_text: str = Field(
        min_length=20,
        max_length=MAX_RESUME_TEXT_CHARS,
        description="Raw resume text for ATS evaluation.",
    )


class CandidateRankingItemSchema(BaseModel):
    candidate_id: str
    candidate_name: str
    final_ats_score: int = Field(ge=0, le=100)
    rule_score: int = Field(ge=0, le=100)
    embedding_score: int = Field(ge=0, le=100)
    llm_confidence_score: int = Field(ge=0, le=100)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    recommendation: Literal["Interview Recommended", "Maybe", "Not Recommended"] = "Maybe"
    shortlist_label: Literal["STRONG_MATCH", "GOOD_MATCH", "BORDERLINE", "REJECT"] = "BORDERLINE"
    rank_position: int = Field(ge=1, description="1-based rank position after sorting.")
    semantic_alignment: str = Field(default="")
    matched_required_skills: list[str] = Field(default_factory=list)
    missing_required_skills: list[str] = Field(default_factory=list)

    @field_validator(
        "final_ats_score",
        "rule_score",
        "embedding_score",
        "llm_confidence_score",
        mode="before",
    )
    @classmethod
    def _clamp_scores(cls, v: object) -> int:
        try:
            return max(0, min(100, int(float(str(v)))))
        except (ValueError, TypeError):
            return 0

    @field_validator("strengths", "weaknesses", "matched_required_skills", "missing_required_skills", mode="before")
    @classmethod
    def _ensure_list(cls, v: object) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return list(v)


class BatchRankingRequestSchema(BaseModel):
    model_config = {"extra": "forbid"}
    resumes: list[BatchResumeSchema] = Field(
        min_length=1,
        max_length=MAX_BATCH_RESUMES,
        description="Batch of resumes to score and rank.",
    )
    job_description_text: str = Field(
        min_length=30,
        max_length=MAX_JD_TEXT_CHARS,
        description="Raw job description text.",
    )
    required_skills: list[str] = Field(
        default_factory=list,
        min_length=1,
        max_length=MAX_LIST_ITEMS,
        description="Non-empty list of required skills. Tokens are normalised to lowercase.",
    )
    preferred_skills: list[str] = Field(
        default_factory=list,
        max_length=MAX_LIST_ITEMS,
        description="Optional list of preferred skills. Tokens are normalised to lowercase.",
    )
    top_k: int = Field(
        default=5,
        ge=1,
        le=MAX_BATCH_RESUMES,
        description="Number of candidates to shortlist.",
    )
    weights: ATSWeightsSchema = Field(default_factory=ATSWeightsSchema)

    @field_validator("required_skills", "preferred_skills", mode="before")
    @classmethod
    def _validate_and_normalise_lists(cls, v: object) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            raise ValueError("Expected an array of strings, got a string.")
        try:
            items = list(v)
        except TypeError as exc:
            raise ValueError("Expected an array of strings.") from exc

        cleaned: list[str] = []
        for item in items:
            if item is None:
                continue
            token = _normalise_token(str(item))
            if not token:
                continue
            if len(token) > MAX_TOKEN_LENGTH:
                raise ValueError(f"Token too long (max {MAX_TOKEN_LENGTH} chars).")
            cleaned.append(token)

        seen: set[str] = set()
        deduped: list[str] = []
        for t in cleaned:
            if t not in seen:
                seen.add(t)
                deduped.append(t)
        return deduped

    @model_validator(mode="after")
    def _validate_required_skills_nonempty(self) -> "BatchRankingRequestSchema":
        if not self.required_skills:
            raise ValueError("required_skills must contain at least one skill.")
        if not self.resumes:
            raise ValueError("resumes must contain at least one resume.")
        if not self.job_description_text or not self.job_description_text.strip():
            raise ValueError("job_description_text must be non-empty.")
        return self


class BatchProcessingSummarySchema(BaseModel):
    average_ats_score: float = 0.0
    top_skill_gaps: list[SkillGapSummarySchema] = Field(default_factory=list)
    strongest_candidate: Optional[CandidateSummarySchema] = None
    weakest_candidate: Optional[CandidateSummarySchema] = None
    processing_latency_ms: int = Field(default=0, ge=0)
    semantic_match_distribution: dict[str, int] = Field(default_factory=dict)
    recruiter_analytics: Optional[RecruiterAnalyticsSchema] = None
    failed_candidates: list[str] = Field(default_factory=list)
    workflow_id: Optional[str] = None
    graph_id: Optional[str] = None
    node_timings_ms: dict[str, int] = Field(default_factory=dict)
    failed_nodes: dict[str, int] = Field(default_factory=dict)
    retry_counts: dict[str, int] = Field(default_factory=dict)
    ranking_trace: dict[str, Any] = Field(default_factory=dict)


class BatchRankingResponseSchema(BaseModel):
    ranked_candidates: list[CandidateRankingItemSchema] = Field(default_factory=list)
    processing_summary: BatchProcessingSummarySchema
    processing_time_ms: int = Field(default=0, ge=0)
    total_candidates: int = Field(default=0, ge=0)
    shortlisted_candidates: list[CandidateRankingItemSchema] = Field(default_factory=list)

