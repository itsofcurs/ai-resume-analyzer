"""
services/rate_limit_service.py
------------------------------
In-memory rate limiting and concurrency guards.
"""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class RateLimitWindow:
    count: int
    reset_at: float


@dataclass
class RateLimitMetrics:
    allowed: int = 0
    blocked: int = 0
    invalid_blocks: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "allowed": self.allowed,
            "blocked": self.blocked,
            "invalid_blocks": self.invalid_blocks,
        }


class RateLimitService:
    def __init__(
        self,
        *,
        invalid_threshold: int,
        invalid_block_seconds: int,
    ) -> None:
        self._windows: dict[str, RateLimitWindow] = {}
        self._invalid_counts: dict[str, int] = {}
        self._blocked_until: dict[str, float] = {}
        self._metrics = RateLimitMetrics()
        self._invalid_threshold = max(1, int(invalid_threshold))
        self._invalid_block_seconds = max(1, int(invalid_block_seconds))

    def allow(self, key: str, *, limit: int, window_seconds: int) -> bool:
        now = time.time()
        blocked_until = self._blocked_until.get(key)
        if blocked_until and now < blocked_until:
            self._metrics.blocked += 1
            return False

        window = self._windows.get(key)
        if window is None or now >= window.reset_at:
            window = RateLimitWindow(count=0, reset_at=now + window_seconds)
            self._windows[key] = window

        if window.count >= limit:
            self._metrics.blocked += 1
            return False

        window.count += 1
        self._metrics.allowed += 1
        return True

    def record_invalid(self, key: str) -> bool:
        count = self._invalid_counts.get(key, 0) + 1
        self._invalid_counts[key] = count
        if count >= self._invalid_threshold:
            self._blocked_until[key] = time.time() + self._invalid_block_seconds
            self._metrics.invalid_blocks += 1
            self._invalid_counts[key] = 0
            return True
        return False

    def metrics(self) -> dict[str, int]:
        return self._metrics.to_dict()

    def clear(self) -> None:
        self._windows.clear()
        self._invalid_counts.clear()
        self._blocked_until.clear()


class ConcurrencyGuard:
    def __init__(self, default_limit: int = 10) -> None:
        self._default_limit = max(1, int(default_limit))
        self._semaphores: dict[str, asyncio.Semaphore] = {}
        self._inflight: dict[str, int] = {}

    def _get_semaphore(self, key: str, limit: Optional[int] = None) -> asyncio.Semaphore:
        if key not in self._semaphores:
            self._semaphores[key] = asyncio.Semaphore(limit or self._default_limit)
        return self._semaphores[key]

    @asynccontextmanager
    async def acquire(self, key: str, *, limit: Optional[int] = None):
        sem = self._get_semaphore(key, limit)
        await sem.acquire()
        self._inflight[key] = self._inflight.get(key, 0) + 1
        try:
            yield
        finally:
            self._inflight[key] = max(0, self._inflight.get(key, 1) - 1)
            sem.release()

    def inflight(self, key: str) -> int:
        return self._inflight.get(key, 0)

