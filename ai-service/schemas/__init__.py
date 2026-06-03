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

from schemas.resume_schema import (
    ResumeParseResponse,
    ExperienceSchema,
    EducationSchema,
    ProjectSchema,
)
from schemas.job_match_schema import (
    RuleBasedScoreSchema,
    EmbeddingScoreSchema,
    ATSReasoningSchema,
    ATSWeightsSchema,
    JobMatchRequestSchema,
    FinalATSAnalysisSchema,
    HybridATSResponseSchema,
)
from schemas.ranking_schema import (
    BatchRankingRequestSchema,
    BatchRankingResponseSchema,
    BatchProcessingSummarySchema,
    BatchResumeSchema,
    CandidateRankingItemSchema,
)
from schemas.recruiter_analytics_schema import (
    CandidateSummarySchema,
    SkillGapSummarySchema,
    RecruiterAnalyticsSchema,
)
from schemas.workflow_event_schema import WorkflowEventSchema
from schemas.error_schema import ErrorResponseSchema

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
