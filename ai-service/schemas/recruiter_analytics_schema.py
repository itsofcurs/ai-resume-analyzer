"""
schemas/recruiter_analytics_schema.py
-------------------------------------
Reusable recruiter analytics data contracts.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class SkillGapSummarySchema(BaseModel):
    skill: str
    count: int = Field(ge=0)


class CandidateSummarySchema(BaseModel):
    candidate_id: str
    candidate_name: str
    final_ats_score: int = Field(ge=0, le=100)


class RecruiterAnalyticsSchema(BaseModel):
    average_ats_score: float = 0.0
    percentile_distribution: dict[str, float] = Field(default_factory=dict)
    strongest_candidate: Optional[CandidateSummarySchema] = None
    weakest_candidate: Optional[CandidateSummarySchema] = None
    top_missing_skills: list[SkillGapSummarySchema] = Field(default_factory=list)
    semantic_alignment_average: float = 0.0
    shortlist_counts: dict[str, int] = Field(default_factory=dict)
