"""
schemas/ats_ranking_schema.py
------------------------------
Pydantic v2 schemas for standalone ATS scoring and candidate ranking.

These schemas are used by the LangGraph pipeline nodes to produce
per-resume intelligence WITHOUT requiring a Job Description.

The existing `job_match_schema.py` handles JD-matched scoring (Phase 2).
These schemas handle upload-time standalone scoring (Phase 1).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class StandaloneATSScoreSchema(BaseModel):
    """
    Standalone ATS score produced at upload time (no JD required).

    Sub-scores:
        skill_completeness: How comprehensive and relevant is the skill set?
        experience_score:   Quality and depth of work experience.
        education_score:    Educational background strength.
        resume_quality:     Formatting, clarity, and presentation quality.
        overall_score:      Weighted aggregate of all sub-scores.
    """

    overall_score: int = Field(default=50, ge=0, le=100)
    skill_completeness: int = Field(default=50, ge=0, le=100)
    experience_score: int = Field(default=50, ge=0, le=100)
    education_score: int = Field(default=50, ge=0, le=100)
    resume_quality: int = Field(default=50, ge=0, le=100)

    @field_validator(
        "overall_score",
        "skill_completeness",
        "experience_score",
        "education_score",
        "resume_quality",
        mode="before",
    )
    @classmethod
    def clamp_score(cls, v: object) -> int:
        try:
            return max(0, min(100, int(float(str(v)))))
        except (ValueError, TypeError):
            return 50


class CandidateRankingResultSchema(BaseModel):
    """
    Candidate ranking produced at upload time.

    Fields:
        grade:                   Letter grade (A/B/C/D/F).
        tier:                    Human-readable tier label.
        recruiter_recommendation: Brief recommendation text for the recruiter.
        hiring_priority:         Priority level for hiring pipeline.
    """

    grade: Literal["A+", "A", "B+", "B", "C+", "C", "D", "F"] = Field(
        default="C",
        description="Letter grade based on overall candidate quality.",
    )
    tier: Literal["Exceptional", "Strong", "Moderate", "Developing", "Weak"] = Field(
        default="Moderate",
        description="Human-readable tier classification.",
    )
    recruiter_recommendation: str = Field(
        default="Candidate requires further evaluation.",
        description="Brief actionable recommendation for the recruiter.",
    )
    hiring_priority: Literal["Critical", "High", "Medium", "Low", "Do Not Hire"] = (
        Field(
            default="Medium",
            description="Hiring pipeline priority level.",
        )
    )

    @field_validator("grade", mode="before")
    @classmethod
    def normalise_grade(cls, v: object) -> str:
        valid = {"A+", "A", "B+", "B", "C+", "C", "D", "F"}
        s = str(v).strip().upper()
        return s if s in valid else "C"

    @field_validator("tier", mode="before")
    @classmethod
    def normalise_tier(cls, v: object) -> str:
        valid = {"Exceptional", "Strong", "Moderate", "Developing", "Weak"}
        s = str(v).strip().title()
        return s if s in valid else "Moderate"

    @field_validator("hiring_priority", mode="before")
    @classmethod
    def normalise_priority(cls, v: object) -> str:
        valid = {"Critical", "High", "Medium", "Low", "Do Not Hire"}
        s = str(v).strip().title()
        if s == "Do Not Hire":
            return "Do Not Hire"
        return s if s in valid else "Medium"
