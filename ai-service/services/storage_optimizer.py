"""
services/storage_optimizer.py
-----------------------------
Deployment-time storage optimization hooks.

This module provides optional functions to:
  - Create MongoDB indexes (including TTL for ephemeral traces/events).
  - Create MongoDB Atlas Vector Search index (programmatic setup).
  - Prepare for embedding deduplication / cleanup strategies.

It is safe to import and does nothing automatically.
"""

from __future__ import annotations

from typing import Any


class StorageOptimizer:
    def __init__(self) -> None:
        pass

    async def ensure_mongo_indexes(self, mongo_collection) -> dict[str, Any]:
        """
        Create recommended indexes for recruiter queries and pipeline stability.
        Expects a Motor collection.
        """
        created: list[str] = []
        try:
            created.append(await mongo_collection.create_index([("status", 1)]))
            created.append(await mongo_collection.create_index([("candidateEmail", 1)]))
            created.append(await mongo_collection.create_index([("candidateName", 1)]))
            created.append(await mongo_collection.create_index([("createdAt", -1)]))
        except Exception as exc:
            return {"status": "failed", "error": str(exc), "created": created}
        return {"status": "ok", "created": created}

    async def ensure_ttl_index(
        self,
        mongo_collection,
        *,
        field: str,
        expire_after_seconds: int,
    ) -> dict[str, Any]:
        """
        Create a TTL index for ephemeral documents.
        """
        try:
            name = await mongo_collection.create_index(
                [(field, 1)],
                expireAfterSeconds=int(expire_after_seconds),
            )
            return {"status": "ok", "index": name}
        except Exception as exc:
            return {"status": "failed", "error": str(exc)}
