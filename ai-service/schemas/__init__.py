"""
schemas/
--------
Pydantic v2 data models for all AI service inputs and outputs.

Strict typing ensures:
  - Validated structured data flowing between agents and workflows
  - Self-documenting API contracts
  - Ready for FastAPI response_model integration

Current schemas:
  - ResumeParseResponse  → full structured output from ResumeParserAgent
  - ExperienceSchema     → individual work experience entry
  - EducationSchema      → individual education entry
  - ProjectSchema        → individual project entry
"""

from schemas.error_schema import ErrorResponseSchema
from schemas.job_match_schema import (
    ATSReasoningSchema,
    ATSWeightsSchema,
    EmbeddingScoreSchema,
    FinalATSAnalysisSchema,
    HybridATSResponseSchema,
    JobMatchRequestSchema,
    RuleBasedScoreSchema,
)
from schemas.ranking_schema import (
    BatchProcessingSummarySchema,
    BatchRankingRequestSchema,
    BatchRankingResponseSchema,
    BatchResumeSchema,
    CandidateRankingItemSchema,
)
from schemas.recruiter_analytics_schema import (
    CandidateSummarySchema,
    RecruiterAnalyticsSchema,
    SkillGapSummarySchema,
)
from schemas.resume_schema import (
    EducationSchema,
    ExperienceSchema,
    ProjectSchema,
    ResumeParseResponse,
)
from schemas.workflow_event_schema import WorkflowEventSchema

__all__ = [
    "ResumeParseResponse",
    "ExperienceSchema",
    "EducationSchema",
    "ProjectSchema",
    "RuleBasedScoreSchema",
    "EmbeddingScoreSchema",
    "ATSReasoningSchema",
    "ATSWeightsSchema",
    "JobMatchRequestSchema",
    "FinalATSAnalysisSchema",
    "HybridATSResponseSchema",
    "BatchRankingRequestSchema",
    "BatchRankingResponseSchema",
    "BatchProcessingSummarySchema",
    "BatchResumeSchema",
    "CandidateRankingItemSchema",
    "CandidateSummarySchema",
    "SkillGapSummarySchema",
    "RecruiterAnalyticsSchema",
    "WorkflowEventSchema",
    "ErrorResponseSchema",
]
