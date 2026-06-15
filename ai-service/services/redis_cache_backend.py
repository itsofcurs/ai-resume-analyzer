"""
services/redis_cache_backend.py
-------------------------------
Production Redis cache backend behind the existing BaseCacheBackend contract.

Key goals:
  - Uses an async Redis client (`redis.asyncio`) internally.
  - Preserves the existing *sync* cache backend interface by executing Redis
    coroutines on a dedicated background event loop thread.
  - TTL support, namespaced keys, serialization abstraction.
  - Safe reconnect handling and graceful failure (caller can fall back to memory).

Important:
  - Redis is OPTIONAL at runtime. If Redis is unavailable, CacheService should
    degrade to InMemoryCacheBackend.
"""

from __future__ import annotations

import asyncio
import threading
import time
from dataclasses import dataclass
from typing import Any, Optional

import orjson
import redis.asyncio as redis
from services.cache_service import BaseCacheBackend, CacheEntry, CacheMetrics


class _AsyncLoopThread:
    def __init__(self) -> None:
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self) -> None:
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def run(self, coro, timeout_s: float) -> Any:
        fut = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return fut.result(timeout=timeout_s)

    def stop(self) -> None:
        self._loop.call_soon_threadsafe(self._loop.stop)


@dataclass
class RedisCacheMetrics(CacheMetrics):
    get_latency_ms_sum: int = 0
    get_latency_ms_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()
        avg = 0
        if self.get_latency_ms_count:
            avg = int(self.get_latency_ms_sum / self.get_latency_ms_count)
        base.update(
            {
                "avg_get_latency_ms": avg,
                "get_latency_samples": self.get_latency_ms_count,
            }
        )
        return base


class RedisCacheBackend(BaseCacheBackend):
    def __init__(
        self,
        *,
        redis_url: str,
        namespace: str,
        socket_timeout_s: float = 2.0,
        connect_timeout_s: float = 2.0,
        op_timeout_s: float = 2.0,
    ) -> None:
        self._namespace = (namespace or "ai-service").strip()
        self._metrics = RedisCacheMetrics()
        self._op_timeout_s = float(op_timeout_s)
        self._loop_thread = _AsyncLoopThread()
        self._client = redis.from_url(
            redis_url,
            socket_timeout=socket_timeout_s,
            socket_connect_timeout=connect_timeout_s,
            decode_responses=False,  # bytes
        )

    def _k(self, key: str) -> str:
        return f"{self._namespace}:{key}"

    @staticmethod
    def _serialize(entry: CacheEntry) -> bytes:
        payload = {
            "v": entry.value,
            "created_at": entry.created_at,
            "ttl_seconds": entry.ttl_seconds,
            "metadata": entry.metadata,
        }
        # orjson is fast and stable; opt into non-str keys/bytes support if needed later.
        return orjson.dumps(payload)

    @staticmethod
    def _deserialize(raw: bytes) -> CacheEntry:
        obj = orjson.loads(raw)
        return CacheEntry(
            value=obj.get("v"),
            created_at=float(obj.get("created_at") or time.time()),
            ttl_seconds=obj.get("ttl_seconds"),
            metadata=obj.get("metadata") or {},
        )

    def get(self, key: str) -> Optional[CacheEntry]:
        start = time.perf_counter()
        try:
            raw = self._loop_thread.run(
                self._client.get(self._k(key)), timeout_s=self._op_timeout_s
            )
            elapsed_ms = int((time.perf_counter() - start) * 1000)
            self._metrics.get_latency_ms_sum += elapsed_ms
            self._metrics.get_latency_ms_count += 1
            if raw is None:
                self._metrics.misses += 1
                return None
            self._metrics.hits += 1
            return self._deserialize(raw)
        except Exception:
            self._metrics.misses += 1
            return None

    def set(self, key: str, entry: CacheEntry) -> None:
        try:
            data = self._serialize(entry)
            k = self._k(key)
            if entry.ttl_seconds is not None:
                self._loop_thread.run(
                    self._client.set(k, data, ex=int(entry.ttl_seconds)),
                    timeout_s=self._op_timeout_s,
                )
            else:
                self._loop_thread.run(
                    self._client.set(k, data), timeout_s=self._op_timeout_s
                )
            self._metrics.sets += 1
        except Exception:
            # set failures should not crash the workflow; caller can fall back.
            return None

    def delete(self, key: str) -> None:
        try:
            self._loop_thread.run(
                self._client.delete(self._k(key)), timeout_s=self._op_timeout_s
            )
            self._metrics.evictions += 1
        except Exception:
            return None

    def clear(self) -> None:
        # Avoid expensive flushall; namespace clear is not safe without key scan.
        # Keep as no-op for now; can be implemented with SCAN+DEL later.
        return None

    def health(self) -> dict[str, Any]:
        try:
            pong = self._loop_thread.run(
                self._client.ping(), timeout_s=self._op_timeout_s
            )
            return {"backend": "redis", "status": "ready" if pong else "unavailable"}
        except Exception:
            return {"backend": "redis", "status": "unavailable"}

    def metrics(self) -> CacheMetrics:
        return self._metrics

    def close(self) -> None:
        try:
            self._loop_thread.run(self._client.close(), timeout_s=self._op_timeout_s)
        except Exception:
            pass
