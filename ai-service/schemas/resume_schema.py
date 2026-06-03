"""
schemas/resume_schema.py
------------------------
Pydantic v2 data models for the AI resume parsing pipeline.

Design principles:
  - All fields are Optional to tolerate partial/imperfect LLM outputs.
  - Model-level validators clamp numeric scores to the [0, 100] range.
  - Strict typing with clear field descriptions for self-documenting APIs.
  - These schemas are the single source of truth for data contracts
    between agents, workflows, and FastAPI route handlers.

Future usage:
  - Use as FastAPI response_model for typed, auto-documented endpoints.
  - Extend with ATSScoreSchema, SkillGapSchema, etc. as new agents are added.
"""

from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Sub-schemas (nested objects)
# ---------------------------------------------------------------------------

class ExperienceSchema(BaseModel):
    """
    Represents a single work experience entry from a resume.

    Attributes:
        role:       Job title / designation (e.g., "Senior Software Engineer").
        company:    Employer name (e.g., "Google India Pvt. Ltd.").
        duration:   Employment period string (e.g., "July 2022 – Present").
        description: Optional bullet-point summary of responsibilities / achievements.
    """

    role: Optional[str] = Field(default=None, description="Job title or designation.")
    company: Optional[str] = Field(default=None, description="Employer / company name.")
    duration: Optional[str] = Field(
        default=None,
        description="Employment period, e.g. 'Jan 2021 – Dec 2023'.",
    )
    description: Optional[str] = Field(
        default=None,
        description="Summary of responsibilities and achievements.",
    )


class EducationSchema(BaseModel):
    """
    Represents a single education entry from a resume.

    Attributes:
        degree:      Qualification title (e.g., "B.Tech in Computer Science").
        institution: University / college name.
        year:        Year range or graduation year (e.g., "2016 – 2020").
        grade:       Optional CGPA, percentage, or honours classification.
    """

    degree: Optional[str] = Field(default=None, description="Degree or qualification.")
    institution: Optional[str] = Field(
        default=None, description="University or college name."
    )
    year: Optional[str] = Field(
        default=None, description="Study period or graduation year."
    )
    grade: Optional[str] = Field(
        default=None, description="CGPA, percentage, or classification."
    )


class ProjectSchema(BaseModel):
    """
    Represents a single project entry from a resume.

    Attributes:
        name:         Project title.
        description:  Brief description of what the project does.
        tech_stack:   List of technologies / languages used.
        url:          Optional GitHub / live URL.
    """

    name: Optional[str] = Field(default=None, description="Project title.")
    description: Optional[str] = Field(
        default=None, description="What the project does / key outcomes."
    )
    tech_stack: Optional[List[str]] = Field(
        default_factory=list,
        description="Technologies used (e.g. ['React', 'FastAPI', 'PostgreSQL']).",
    )
    url: Optional[str] = Field(
        default=None, description="GitHub or live project URL."
    )


# ---------------------------------------------------------------------------
# Top-level response schema
# ---------------------------------------------------------------------------

class ResumeParseResponse(BaseModel):
    """
    Fully structured output produced by ResumeParserAgent.

    This is the canonical data contract flowing from the agent layer
    through the workflow layer and ultimately into MongoDB.

    Core extraction fields:
        name, email, phone, skills

    Rich extraction fields (future UI support):
        experience, education, projects

    Authenticity audit fields (populated by Gemini):
        authenticity_score, ai_generated_probability,
        red_flags, technical_depth_score

    Metadata:
        raw_text_length: character count of the source resume text.
    """

    # -- Core contact / identity fields -------------------------------------
    name: str = Field(
        default="Unknown Candidate",
        description="Full name of the candidate.",
    )
    email: Optional[str] = Field(
        default=None, description="Candidate email address."
    )
    phone: Optional[str] = Field(
        default=None, description="Candidate phone number."
    )

    # -- Skills -------------------------------------------------------------
    skills: List[str] = Field(
        default_factory=list,
        description="Deduplicated list of technical skills extracted from the resume.",
    )

    # -- Rich structured sections -------------------------------------------
    experience: List[ExperienceSchema] = Field(
        default_factory=list,
        description="Work experience entries, most recent first.",
    )
    education: List[EducationSchema] = Field(
        default_factory=list,
        description="Educational qualifications, most recent first.",
    )
    projects: List[ProjectSchema] = Field(
        default_factory=list,
        description="Notable projects listed in the resume.",
    )

    # -- Authenticity audit fields ------------------------------------------
    authenticity_score: int = Field(
        default=90,
        ge=0,
        le=100,
        description=(
            "Overall resume authenticity score (0–100). "
            "High values indicate a genuine, well-substantiated resume."
        ),
    )
    ai_generated_probability: int = Field(
        default=10,
        ge=0,
        le=100,
        description=(
            "Estimated probability (0–100) that the resume was AI-generated. "
            "Values above 70 warrant manual review."
        ),
    )
    red_flags: List[str] = Field(
        default_factory=list,
        description=(
            "List of specific concerns found during the audit "
            "(e.g. overlapping employment dates, keyword stuffing). "
            "Empty list means no issues detected."
        ),
    )
    technical_depth_score: int = Field(
        default=80,
        ge=0,
        le=100,
        description=(
            "Estimate of the candidate's technical depth (0–100) "
            "based on project complexity and specificity of experience."
        ),
    )

    # -- Metadata -----------------------------------------------------------
    raw_text_length: Optional[int] = Field(
        default=None,
        description="Character count of the raw resume text processed.",
    )

    # -- Validators ---------------------------------------------------------

    @field_validator("authenticity_score", "ai_generated_probability", "technical_depth_score", mode="before")
    @classmethod
    def clamp_score(cls, v: object) -> int:
        """Clamp any numeric score to [0, 100] and cast to int."""
        try:
            value = int(float(str(v)))
            return max(0, min(100, value))
        except (ValueError, TypeError):
            return 90  # Safe default

    @field_validator("skills", "red_flags", mode="before")
    @classmethod
    def ensure_list(cls, v: object) -> list:
        """Coerce None / non-list values to an empty list."""
        if v is None:
            return []
        if isinstance(v, str):
            # Handle comma-separated skills string from LLM
            return [s.strip() for s in v.split(",") if s.strip()]
        return list(v)

    @model_validator(mode="after")
    def deduplicate_skills(self) -> "ResumeParseResponse":
        """Remove duplicate skill entries (case-insensitive dedup, preserve casing of first occurrence)."""
        seen: set[str] = set()
        unique: list[str] = []
        for skill in self.skills:
            normalised = skill.lower().strip()
            if normalised not in seen:
                seen.add(normalised)
                unique.append(skill.strip())
        self.skills = unique
        return self

    # -- Conversion helpers -------------------------------------------------

    def to_parsed_data(self) -> dict:
        """
        Return a lightweight dict matching the `parsedData` shape expected
        by the existing MongoDB document structure.

        This preserves full backward compatibility with the Node.js gateway
        and the existing frontend without requiring any schema migration.
        """
        return {
            "name": self.name,
            "email": self.email or "",
            "phone": self.phone or "",
            "skills": self.skills,
        }

    def to_ai_analysis(self) -> dict:
        """
        Return a dict matching the `aiAnalysis` shape expected by MongoDB.

        Backward-compatible with the existing authenticity block written
        by the original nlp_pipeline.analyze_resume_unified().
        """
        return {
            "authenticity_score": self.authenticity_score,
            "ai_generated_probability": self.ai_generated_probability,
            "red_flags": self.red_flags,
            "technical_depth_score": self.technical_depth_score,
            # Rich structured data stored alongside for future UI rendering
            "experience": [e.model_dump(exclude_none=True) for e in self.experience],
            "education": [e.model_dump(exclude_none=True) for e in self.education],
            "projects": [p.model_dump(exclude_none=True) for p in self.projects],
        }
