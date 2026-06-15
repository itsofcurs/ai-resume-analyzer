"""
services/redis_rate_limit_backend.py
-----------------------------------
Redis-backed distributed rate limiting using a sliding window approximation.

Design:
  - Uses a single Redis key per (client, endpoint) with INCR + EXPIRE window.
  - Not perfect sliding-window, but stable, simple, and distributed.
  - If Redis is unavailable, callers should fall back to in-memory RateLimitService.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Any

import redis.asyncio as redis


class RedisRateLimiter:
    def __init__(
        self,
        *,
        redis_url: str,
        namespace: str = "ai-service",
        op_timeout_s: float = 1.5,
    ) -> None:
        self._ns = namespace.strip() or "ai-service"
        self._timeout_s = float(op_timeout_s)
        self._client = redis.from_url(redis_url, decode_responses=True)

        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self) -> None:
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def _exec(self, coro):
        fut = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return fut.result(timeout=self._timeout_s)

    def allow(self, key: str, *, limit: int, window_seconds: int) -> bool:
        """
        Fixed-window distributed limit: INCR + EXPIRE on first hit.
        """
        k = f"{self._ns}:rl:{key}"

        async def _op():
            # pipeline ensures expire is set on first increment
            pipe = self._client.pipeline()
            pipe.incr(k, amount=1)
            pipe.expire(k, int(window_seconds), nx=True)
            val, _ = await pipe.execute()
            return int(val)

        try:
            count = self._exec(_op())
            return count <= int(limit)
        except Exception:
            return True  # fail-open; API middleware can fallback to in-memory + metrics

    def health(self) -> dict[str, Any]:
        async def _ping():
            return await self._client.ping()

        try:
            ok = self._exec(_ping())
            return {"backend": "redis", "status": "ready" if ok else "unavailable"}
        except Exception:
            return {"backend": "redis", "status": "unavailable"}
