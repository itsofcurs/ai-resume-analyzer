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

from services.cache_service import (
    BaseCacheBackend,
    CacheMetrics,
    CacheService,
    InMemoryCacheBackend,
    RedisCacheBackend,
    cache_service,
)
from services.candidate_ranker import (
    CandidateRanker,
    CandidateRankingInput,
    RankingThresholds,
)
from services.embedding_matcher import EmbeddingMatcher, EmbeddingMatcherConfig
from services.gemini_service import GeminiService
from services.job_queue_service import JobQueueService, job_queue_service
from services.rate_limit_service import ConcurrencyGuard, RateLimitService
from services.rule_based_scorer import RuleBasedScorer, RuleBasedScoringConfig
from services.workflow_event_service import WorkflowEventService, workflow_event_service
from services.workflow_trace_service import WorkflowTraceService, workflow_trace_service

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
