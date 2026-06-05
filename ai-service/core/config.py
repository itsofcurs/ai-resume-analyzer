"""
core/config.py
--------------
Centralized application settings (Pydantic Settings).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Environment / service settings
    environment: str = Field(default="development", alias="ENVIRONMENT")
    app_name: str = Field(default="AI Recruitment Intelligence", alias="APP_NAME")
    node_backend_url: str = Field(default="http://127.0.0.1:5000", alias="NODE_BACKEND_URL")

    # Gemini / LLM settings
    llm_enabled: bool = Field(default=True, alias="LLM_ENABLED")
    gemini_api_key: Optional[str] = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    gemini_timeout_s: float = Field(default=30.0, alias="GEMINI_TIMEOUT_S")
    gemini_max_retries: int = Field(default=3, alias="GEMINI_MAX_RETRIES")

    # DeepSeek settings
    deepseek_api_key: Optional[str] = Field(default=None, alias="DEEPSEEK_API_KEY")
    deepseek_model: str = Field(default="deepseek-chat", alias="DEEPSEEK_MODEL")
    
    # Qwen settings
    qwen_api_key: Optional[str] = Field(default=None, alias="QWEN_API_KEY")
    qwen_model: str = Field(default="qwen-max", alias="QWEN_MODEL")

    # Groq settings
    groq_api_key: Optional[str] = Field(default=None, alias="GROQ_API_KEY")
    groq_model: str = Field(default="llama3-70b-8192", alias="GROQ_MODEL")

    # OpenRouter settings
    openrouter_api_key: Optional[str] = Field(default=None, alias="OPENROUTER_API_KEY")
    openrouter_model: str = Field(default="meta-llama/llama-3-8b-instruct", alias="OPENROUTER_MODEL")

    # Cache settings
    cache_backend: str = Field(default="memory", alias="CACHE_BACKEND")
    cache_default_ttl_s: Optional[int] = Field(default=None, alias="CACHE_DEFAULT_TTL_S")
    cache_namespace: str = Field(default="ai-service", alias="CACHE_NAMESPACE")

    # Redis cache (optional; only required if CACHE_BACKEND=redis)
    redis_url: Optional[str] = Field(default=None, alias="REDIS_URL")
    redis_socket_timeout_s: float = Field(default=2.0, alias="REDIS_SOCKET_TIMEOUT_S")
    redis_connect_timeout_s: float = Field(default=2.0, alias="REDIS_CONNECT_TIMEOUT_S")

    # Storage settings
    mongodb_uri: str = Field(default="mongodb://localhost:27017/talentdb", alias="MONGODB_URI")

    # Concurrency / timeouts
    max_batch_concurrency: int = Field(default=5, alias="MAX_BATCH_CONCURRENCY")
    max_inflight_job_match: int = Field(default=10, alias="MAX_INFLIGHT_JOB_MATCH")
    max_inflight_batch: int = Field(default=3, alias="MAX_INFLIGHT_BATCH")
    max_inflight_process: int = Field(default=10, alias="MAX_INFLIGHT_PROCESS")
    max_inflight_search: int = Field(default=20, alias="MAX_INFLIGHT_SEARCH")
    batch_parse_timeout_s: float = Field(default=30.0, alias="BATCH_PARSE_TIMEOUT_S")
    batch_score_timeout_s: float = Field(default=45.0, alias="BATCH_SCORE_TIMEOUT_S")
    request_timeout_job_match_s: float = Field(default=60.0, alias="REQ_TIMEOUT_JOB_MATCH_S")
    request_timeout_batch_s: float = Field(default=120.0, alias="REQ_TIMEOUT_BATCH_S")
    request_timeout_process_s: float = Field(default=60.0, alias="REQ_TIMEOUT_PROCESS_S")
    request_timeout_search_s: float = Field(default=30.0, alias="REQ_TIMEOUT_SEARCH_S")

    # Rate limits (per minute)
    rate_limit_job_match_per_min: int = Field(default=60, alias="RATE_LIMIT_JOB_MATCH_PER_MIN")
    rate_limit_batch_per_min: int = Field(default=20, alias="RATE_LIMIT_BATCH_PER_MIN")
    rate_limit_process_per_min: int = Field(default=60, alias="RATE_LIMIT_PROCESS_PER_MIN")
    rate_limit_search_per_min: int = Field(default=120, alias="RATE_LIMIT_SEARCH_PER_MIN")

    # Request / payload guards
    max_request_size_bytes: int = Field(default=2_000_000, alias="MAX_REQUEST_SIZE_BYTES")
    max_batch_resumes: int = Field(default=200, alias="MAX_BATCH_RESUMES")
    invalid_payload_block_threshold: int = Field(default=5, alias="INVALID_PAYLOAD_BLOCK_THRESHOLD")
    invalid_payload_block_seconds: int = Field(default=60, alias="INVALID_PAYLOAD_BLOCK_SECONDS")

    # Shortlist thresholds
    shortlist_strong_match: int = Field(default=85, alias="SHORTLIST_STRONG_MATCH")
    shortlist_good_match: int = Field(default=70, alias="SHORTLIST_GOOD_MATCH")
    shortlist_borderline: int = Field(default=55, alias="SHORTLIST_BORDERLINE")

    # Health check tuning
    healthcheck_timeout_s: float = Field(default=3.0, alias="HEALTHCHECK_TIMEOUT_S")

    # Observability
    prometheus_metrics_enabled: bool = Field(default=True, alias="PROMETHEUS_METRICS_ENABLED")
    otel_enabled: bool = Field(default=False, alias="OTEL_ENABLED")
    otel_service_name: str = Field(default="ai-service", alias="OTEL_SERVICE_NAME")
    otel_exporter_otlp_endpoint: Optional[str] = Field(default=None, alias="OTEL_EXPORTER_OTLP_ENDPOINT")

    # Security / auth (optional; if not set, recruiter endpoints remain open)
    recruiter_api_keys: str = Field(default="", alias="RECRUITER_API_KEYS")  # comma-separated
    internal_api_key: Optional[str] = Field(default=None, alias="INTERNAL_API_KEY")

    @field_validator(
        "max_batch_concurrency",
        "max_inflight_job_match",
        "max_inflight_batch",
        "max_inflight_process",
        "max_inflight_search",
        "rate_limit_job_match_per_min",
        "rate_limit_batch_per_min",
        "rate_limit_process_per_min",
        "rate_limit_search_per_min",
        "max_request_size_bytes",
        "max_batch_resumes",
        "invalid_payload_block_threshold",
        "invalid_payload_block_seconds",
        "shortlist_strong_match",
        "shortlist_good_match",
        "shortlist_borderline",
        mode="before",
    )
    @classmethod
    def _ensure_positive(cls, v: object) -> int:
        value = int(float(v))
        if value <= 0:
            raise ValueError("Configuration values must be positive.")
        return value

    def validate_startup(self) -> None:
        if self.llm_enabled and not any([self.gemini_api_key, self.groq_api_key, self.openrouter_api_key]):
            raise ValueError("At least one LLM API Key (GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY) is required when LLM_ENABLED is true.")
        if self.environment == "production" and self.cache_backend.lower().strip() != "redis":
            raise ValueError("Redis must be used as the CACHE_BACKEND in production.")
        if self.cache_backend.lower().strip() == "redis" and not self.redis_url:
            raise ValueError("REDIS_URL is required when CACHE_BACKEND=redis.")
        if self.shortlist_strong_match < self.shortlist_good_match:
            raise ValueError("SHORTLIST_STRONG_MATCH must be >= SHORTLIST_GOOD_MATCH.")
        if self.shortlist_good_match < self.shortlist_borderline:
            raise ValueError("SHORTLIST_GOOD_MATCH must be >= SHORTLIST_BORDERLINE.")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_startup()
    return settings

