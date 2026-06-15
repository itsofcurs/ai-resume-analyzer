"""
services/cache_service.py
-------------------------
Cache abstractions with Redis-ready backend interfaces and metrics.
"""

from __future__ import annotations

import hashlib
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

from core.config import get_settings
from core.errors import CacheError
from schemas.job_match_schema import FinalATSAnalysisSchema
from schemas.resume_schema import ResumeParseResponse


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()


@dataclass
class CacheEntry:
    value: Any
    created_at: float = field(default_factory=lambda: time.time())
    ttl_seconds: Optional[int] = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def is_expired(self) -> bool:
        if self.ttl_seconds is None:
            return False
        return (time.time() - self.created_at) > self.ttl_seconds


@dataclass
class CacheMetrics:
    hits: int = 0
    misses: int = 0
    sets: int = 0
    evictions: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "hits": self.hits,
            "misses": self.misses,
            "sets": self.sets,
            "evictions": self.evictions,
        }


class BaseCacheBackend(ABC):
    @abstractmethod
    def get(self, key: str) -> Optional[CacheEntry]:
        raise NotImplementedError

    @abstractmethod
    def set(self, key: str, entry: CacheEntry) -> None:
        raise NotImplementedError

    @abstractmethod
    def delete(self, key: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def clear(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def health(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def metrics(self) -> CacheMetrics:
        raise NotImplementedError


class InMemoryCacheBackend(BaseCacheBackend):
    def __init__(self) -> None:
        self._store: dict[str, CacheEntry] = {}
        self._metrics = CacheMetrics()

    def get(self, key: str) -> Optional[CacheEntry]:
        entry = self._store.get(key)
        if entry is None:
            self._metrics.misses += 1
            return None
        if entry.is_expired():
            self._store.pop(key, None)
            self._metrics.evictions += 1
            self._metrics.misses += 1
            return None
        self._metrics.hits += 1
        return entry

    def set(self, key: str, entry: CacheEntry) -> None:
        self._store[key] = entry
        self._metrics.sets += 1

    def delete(self, key: str) -> None:
        if key in self._store:
            self._store.pop(key, None)
            self._metrics.evictions += 1

    def clear(self) -> None:
        self._store.clear()

    def health(self) -> dict[str, Any]:
        return {
            "backend": "memory",
            "status": "ready",
            "size": len(self._store),
        }

    def metrics(self) -> CacheMetrics:
        return self._metrics


class RedisCacheBackend(BaseCacheBackend):
    """
    Placeholder retained for backward compatibility.

    Real implementation lives in `services/redis_cache_backend.py` and is selected
    via Settings (CACHE_BACKEND=redis).
    """

    def __init__(self) -> None:
        self._metrics = CacheMetrics()

    def get(self, key: str) -> Optional[CacheEntry]:
        self._metrics.misses += 1
        return None

    def set(self, key: str, entry: CacheEntry) -> None:
        self._metrics.sets += 1

    def delete(self, key: str) -> None:
        self._metrics.evictions += 1

    def clear(self) -> None:
        return None

    def health(self) -> dict[str, Any]:
        return {
            "backend": "redis",
            "status": "unavailable",
            "detail": "Redis backend placeholder not configured.",
        }

    def metrics(self) -> CacheMetrics:
        return self._metrics


class CacheService:
    """
    Deterministic cache facade with backend abstraction.
    """

    def __init__(
        self,
        *,
        backend: Optional[BaseCacheBackend] = None,
        default_ttl: Optional[int] = None,
    ) -> None:
        self._backend = backend or InMemoryCacheBackend()
        self._default_ttl = default_ttl

    @staticmethod
    def resume_key(resume_text: str) -> str:
        return f"resume:{_sha256_text(resume_text)}"

    @staticmethod
    def embedding_key(text: str) -> str:
        return f"embed:{_sha256_text(text)}"

    @staticmethod
    def ats_key(resume_text: str, job_description_text: str) -> str:
        return f"ats:{_sha256_text(resume_text)}:{_sha256_text(job_description_text)}"

    def health(self) -> dict[str, Any]:
        return self._backend.health()

    def metrics(self) -> dict[str, Any]:
        metrics = self._backend.metrics()
        return metrics.to_dict()

    def clear(self) -> None:
        self._backend.clear()

    def get_cached_resume(self, resume_text: str) -> Optional[ResumeParseResponse]:
        key = self.resume_key(resume_text)
        entry = self._backend.get(key)
        if entry is None:
            return None
        value = entry.value
        if isinstance(value, ResumeParseResponse):
            return value.model_copy(deep=True)
        return None

    def set_cached_resume(
        self,
        resume_text: str,
        parsed_resume: ResumeParseResponse,
        *,
        ttl_seconds: Optional[int] = None,
    ) -> None:
        key = self.resume_key(resume_text)
        self._backend.set(
            key,
            CacheEntry(
                value=parsed_resume.model_copy(deep=True),
                ttl_seconds=ttl_seconds or self._default_ttl,
            ),
        )

    def get_cached_embedding(self, text: str) -> Optional[list[float]]:
        key = self.embedding_key(text)
        entry = self._backend.get(key)
        if entry is None:
            return None
        value = entry.value
        if isinstance(value, list):
            return list(value)
        return None

    def set_cached_embedding(
        self,
        text: str,
        vector: list[float],
        *,
        ttl_seconds: Optional[int] = None,
    ) -> None:
        key = self.embedding_key(text)
        self._backend.set(
            key,
            CacheEntry(
                value=list(vector),
                ttl_seconds=ttl_seconds or self._default_ttl,
            ),
        )

    def get_cached_ats(
        self,
        resume_text: str,
        job_description_text: str,
        *,
        weights_signature: Optional[str] = None,
    ) -> Optional[FinalATSAnalysisSchema]:
        key = self.ats_key(resume_text, job_description_text)
        entry = self._backend.get(key)
        if entry is None:
            return None
        if (
            weights_signature
            and entry.metadata.get("weights_signature") != weights_signature
        ):
            return None
        value = entry.value
        if isinstance(value, FinalATSAnalysisSchema):
            return value.model_copy(deep=True)
        return None

    def set_cached_ats(
        self,
        resume_text: str,
        job_description_text: str,
        analysis: FinalATSAnalysisSchema,
        *,
        weights_signature: Optional[str] = None,
        ttl_seconds: Optional[int] = None,
    ) -> None:
        key = self.ats_key(resume_text, job_description_text)
        self._backend.set(
            key,
            CacheEntry(
                value=analysis.model_copy(deep=True),
                ttl_seconds=ttl_seconds or self._default_ttl,
                metadata=(
                    {"weights_signature": weights_signature}
                    if weights_signature
                    else {}
                ),
            ),
        )

    def set_backend(self, backend: BaseCacheBackend) -> None:
        if backend is None:
            raise CacheError("Cache backend cannot be None.")
        self._backend = backend


def _build_cache_backend() -> BaseCacheBackend:
    settings = get_settings()
    backend_type = settings.cache_backend.lower().strip()
    if backend_type == "redis":
        try:
            from services.redis_cache_backend import (
                RedisCacheBackend as RealRedisCacheBackend,
            )

            return RealRedisCacheBackend(
                redis_url=settings.redis_url or "",
                namespace=settings.cache_namespace,
                socket_timeout_s=settings.redis_socket_timeout_s,
                connect_timeout_s=settings.redis_connect_timeout_s,
                op_timeout_s=min(5.0, float(settings.healthcheck_timeout_s)),
            )
        except Exception:
            # Graceful failure fallback
            return InMemoryCacheBackend()
    return InMemoryCacheBackend()


cache_service = CacheService(
    backend=_build_cache_backend(),
    default_ttl=get_settings().cache_default_ttl_s,
)
