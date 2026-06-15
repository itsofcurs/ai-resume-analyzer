"""
schemas/job_match_schema.py
---------------------------
Pydantic v2 schemas for Hybrid ATS scoring and job match workflows.

These schemas are designed to be:
  - Deterministic-layer friendly (rule-based + embedding outputs).
  - LLM-layer friendly (structured reasoning output).
  - Backward-compatible with existing pipeline conventions.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator
from schemas.resume_schema import ResumeParseResponse

MAX_RESUME_TEXT_CHARS: int = 60_000
MAX_JD_TEXT_CHARS: int = 60_000
MAX_LIST_ITEMS: int = 200
MAX_TOKEN_LENGTH: int = 64


def _normalise_token(value: str) -> str:
    token = " ".join(str(value).split()).strip().lower()
    return token


class RuleBasedScoreSchema(BaseModel):
    rule_score: int = Field(ge=0, le=100)
    skill_overlap: int = Field(ge=0, le=100)
    experience_match: int = Field(ge=0, le=100)
    education_match: int = Field(ge=0, le=100)
    keyword_match: int = Field(ge=0, le=100)
    missing_required_skills: list[str] = Field(default_factory=list)
    matched_required_skills: list[str] = Field(
        default_factory=list,
        description="Intersection of required skills and extracted resume skills (case-insensitive).",
    )

    @field_validator(
        "rule_score",
        "skill_overlap",
        "experience_match",
        "education_match",
        "keyword_match",
        mode="before",
    )
    @classmethod
    def _clamp_int(cls, v: object) -> int:
        try:
            return max(0, min(100, int(float(str(v)))))
        except (ValueError, TypeError):
            return 0


class EmbeddingScoreSchema(BaseModel):
    embedding_similarity_score: int = Field(ge=0, le=100)
    cosine_similarity: float = Field(
        default=0.0, description="Raw cosine similarity between embeddings."
    )
    semantic_alignment: str = Field(default="")

    @field_validator("embedding_similarity_score", mode="before")
    @classmethod
    def _clamp_score(cls, v: object) -> int:
        try:
            return max(0, min(100, int(float(str(v)))))
        except (ValueError, TypeError):
            return 0


class ATSReasoningSchema(BaseModel):
    reasoning_summary: str = Field(default="")
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    recommendation: Literal["Interview Recommended", "Maybe", "Not Recommended"] = (
        Field(default="Maybe")
    )
    llm_confidence_score: int = Field(default=50, ge=0, le=100)

    @field_validator("llm_confidence_score", mode="before")
    @classmethod
    def _clamp_conf(cls, v: object) -> int:
        try:
            return max(0, min(100, int(float(str(v)))))
        except (ValueError, TypeError):
            return 50


class ATSWeightsSchema(BaseModel):
    """
    Layer weights used in final ATS aggregation. Normalised automatically.
    """

    rule_weight: float = Field(default=0.5, ge=0.0)
    embedding_weight: float = Field(default=0.3, ge=0.0)
    llm_confidence_weight: float = Field(default=0.2, ge=0.0)

    @model_validator(mode="after")
    def _normalise(self) -> "ATSWeightsSchema":
        total = float(
            self.rule_weight + self.embedding_weight + self.llm_confidence_weight
        )
        if total <= 0.0:
            raise ValueError("Invalid weights: sum of weights must be > 0.")
        self.rule_weight = self.rule_weight / total
        self.embedding_weight = self.embedding_weight / total
        self.llm_confidence_weight = self.llm_confidence_weight / total
        return self


class JobMatchRequestSchema(BaseModel):
    """
    Workflow input schema.
    """

    resume_text: str = Field(
        min_length=20,
        max_length=MAX_RESUME_TEXT_CHARS,
        description="Raw resume text (extracted from PDF/TXT upstream).",
        json_schema_extra={
            "examples": [
                "Jane Doe\nSenior Backend Engineer...\nSkills: Python, FastAPI, MongoDB..."
            ]
        },
    )
    job_description_text: str = Field(
        min_length=30,
        max_length=MAX_JD_TEXT_CHARS,
        description="Raw job description text.",
        json_schema_extra={
            "examples": [
                "We are hiring a backend engineer with FastAPI, MongoDB, Docker..."
            ]
        },
    )

    job_title: Optional[str] = None
    required_skills: list[str] = Field(
        default_factory=list,
        min_length=1,
        max_length=MAX_LIST_ITEMS,
        description="Non-empty list of required skills. Tokens are normalised to lowercase.",
        json_schema_extra={"examples": [["python", "fastapi", "mongodb", "docker"]]},
    )
    preferred_skills: list[str] = Field(
        default_factory=list,
        max_length=MAX_LIST_ITEMS,
        description="Optional list of preferred skills. Tokens are normalised to lowercase.",
        json_schema_extra={"examples": [["kafka", "kubernetes"]]},
    )
    required_keywords: list[str] = Field(
        default_factory=list,
        max_length=MAX_LIST_ITEMS,
        description="Optional list of keywords/phrases required for the role. Normalised to lowercase.",
        json_schema_extra={"examples": [["microservices", "observability"]]},
    )
    preferred_keywords: list[str] = Field(
        default_factory=list,
        max_length=MAX_LIST_ITEMS,
        description="Optional list of preferred keywords/phrases. Normalised to lowercase.",
    )

    min_years_experience: Optional[float] = None
    seniority: Optional[str] = None

    required_degrees: list[str] = Field(default_factory=list)
    preferred_degrees: list[str] = Field(default_factory=list)

    # Aggregation weights
    weights: ATSWeightsSchema = Field(default_factory=ATSWeightsSchema)

    @field_validator(
        "required_skills",
        "preferred_skills",
        "required_keywords",
        "preferred_keywords",
        mode="before",
    )
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

        # Deduplicate while preserving order
        seen: set[str] = set()
        deduped: list[str] = []
        for t in cleaned:
            if t not in seen:
                seen.add(t)
                deduped.append(t)
        return deduped

    @model_validator(mode="after")
    def _validate_required_skills_nonempty(self) -> "JobMatchRequestSchema":
        if not self.required_skills:
            raise ValueError("required_skills must contain at least one skill.")
        if not self.resume_text or not self.resume_text.strip():
            raise ValueError("resume_text must be non-empty.")
        if not self.job_description_text or not self.job_description_text.strip():
            raise ValueError("job_description_text must be non-empty.")
        return self


class FinalATSAnalysisSchema(BaseModel):
    """
    Unified hybrid ATS output returned by JobMatchWorkflow.
    """

    final_ats_score: int = Field(ge=0, le=100)
    rule_score: int = Field(ge=0, le=100)
    embedding_score: int = Field(ge=0, le=100)
    llm_confidence_score: int = Field(ge=0, le=100)

    rule_breakdown: RuleBasedScoreSchema
    embedding_breakdown: EmbeddingScoreSchema
    reasoning: ATSReasoningSchema

    # Optional: include parsed resume for downstream pipelines (ranker/copilot)
    parsed_resume: Optional[ResumeParseResponse] = None

    # Route-level timing metric (not used in scoring, safe for dashboards/SLOs)
    processing_ms: Optional[int] = Field(
        default=None,
        ge=0,
        description="End-to-end processing time for this request in milliseconds.",
    )

    # Observability identifiers (safe to expose)
    request_id: Optional[str] = Field(
        default=None,
        description="Caller-provided or server-generated request ID for tracing.",
    )
    workflow_id: Optional[str] = Field(
        default=None,
        description="Server-generated workflow/run ID for tracing.",
    )
    stage_timings_ms: dict[str, int] = Field(
        default_factory=dict,
        description="Per-stage timing metrics: parse_ms, rule_ms, embedding_ms, llm_ms, total_ms.",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "final_ats_score": 84,
                    "rule_score": 80,
                    "embedding_score": 86,
                    "llm_confidence_score": 88,
                    "rule_breakdown": {
                        "rule_score": 80,
                        "skill_overlap": 85,
                        "experience_match": 70,
                        "education_match": 90,
                        "keyword_match": 80,
                        "missing_required_skills": ["kafka"],
                        "matched_required_skills": ["python", "fastapi", "mongodb"],
                    },
                    "embedding_breakdown": {
                        "embedding_similarity_score": 82,
                        "cosine_similarity": 0.68,
                        "semantic_alignment": "Good semantic alignment with some potential gaps.",
                    },
                    "reasoning": {
                        "reasoning_summary": "The resume aligns strongly with the backend stack and experience scope...",
                        "strengths": [
                            "Strong FastAPI/MongoDB alignment",
                            "Relevant backend project themes",
                        ],
                        "weaknesses": ["Kafka not evidenced in resume skills"],
                        "recommendation": "Interview Recommended",
                        "llm_confidence_score": 88,
                    },
                    "processing_ms": 412,
                    "request_id": "req_123",
                    "workflow_id": "wf_456",
                    "stage_timings_ms": {
                        "parse_ms": 180,
                        "rule_ms": 8,
                        "embedding_ms": 40,
                        "llm_ms": 150,
                        "total_ms": 412,
                    },
                }
            ]
        }
    }

    @field_validator(
        "final_ats_score",
        "rule_score",
        "embedding_score",
        "llm_confidence_score",
        mode="before",
    )
    @classmethod
    def _clamp(cls, v: object) -> int:
        try:
            return max(0, min(100, int(float(str(v)))))
        except (ValueError, TypeError):
            return 0


class HybridATSResponseSchema(BaseModel):
    """
    Wrapper response for future FastAPI endpoints, keeping space for metadata.
    """

    analysis: FinalATSAnalysisSchema
    meta: dict[str, Any] = Field(default_factory=dict)
