"""
services/
---------
Reusable infrastructure service wrappers.

Services abstract external API clients so:
  - Agent code stays provider-agnostic
  - Model configuration is centralized and env-driven
  - Swapping providers (e.g. Gemini → GPT-4) requires only one file change

Current services:
  - GeminiService  → singleton ChatGoogleGenerativeAI wrapper
"""

from services.gemini_service import GeminiService
from services.rule_based_scorer import RuleBasedScorer, RuleBasedScoringConfig
from services.embedding_matcher import EmbeddingMatcher, EmbeddingMatcherConfig
from services.candidate_ranker import CandidateRanker, CandidateRankingInput, RankingThresholds
from services.cache_service import (
    BaseCacheBackend,
    CacheMetrics,
    CacheService,
    InMemoryCacheBackend,
    RedisCacheBackend,
    cache_service,
)
from services.workflow_trace_service import WorkflowTraceService, workflow_trace_service
from services.workflow_event_service import WorkflowEventService, workflow_event_service
from services.job_queue_service import JobQueueService, job_queue_service
from services.rate_limit_service import RateLimitService, ConcurrencyGuard

__all__ = [
    "GeminiService",
    "RuleBasedScorer",
    "RuleBasedScoringConfig",
    "EmbeddingMatcher",
    "EmbeddingMatcherConfig",
    "CandidateRanker",
    "CandidateRankingInput",
    "RankingThresholds",
    "BaseCacheBackend",
    "CacheMetrics",
    "CacheService",
    "InMemoryCacheBackend",
    "RedisCacheBackend",
    "cache_service",
    "WorkflowTraceService",
    "workflow_trace_service",
    "WorkflowEventService",
    "workflow_event_service",
    "JobQueueService",
    "job_queue_service",
    "RateLimitService",
    "ConcurrencyGuard",
]
