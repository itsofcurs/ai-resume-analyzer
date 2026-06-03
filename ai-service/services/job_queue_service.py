"""
services/job_queue_service.py
-----------------------------
Job queue facade with pluggable worker backends.

Default backend remains in-memory to preserve current behavior.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from services.worker_backend import JobState, JobStatus, WorkerBackend

@dataclass
class JobRecord:
    job_id: str
    status: str
    payload: dict[str, Any]
    created_at: float = field(default_factory=lambda: time.time())
    updated_at: float = field(default_factory=lambda: time.time())
    error: Optional[str] = None


class JobQueueService:
    def __init__(self, backend: Optional[WorkerBackend] = None) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._backend = backend

    def enqueue_batch_job(self, payload: dict[str, Any]) -> str:
        if self._backend is not None:
            return self._backend.enqueue("batch_job_match", payload)

        job_id = f"job_{uuid.uuid4().hex}"
        record = JobRecord(job_id=job_id, status="queued", payload=payload)
        self._jobs[job_id] = record
        return job_id

    def get_job_status(self, job_id: str) -> Optional[JobRecord]:
        if self._backend is not None:
            status = self._backend.status(job_id)
            if status is None:
                return None
            return JobRecord(
                job_id=status.job_id,
                status=status.state.value.lower(),
                payload={},
                error=status.failure_reason,
            )
        return self._jobs.get(job_id)

    def cancel_job(self, job_id: str) -> bool:
        if self._backend is not None:
            return self._backend.cancel(job_id)
        record = self._jobs.get(job_id)
        if record is None:
            return False
        if record.status in ("completed", "failed", "cancelled"):
            return False
        record.status = "cancelled"
        record.updated_at = time.time()
        return True

    def health(self) -> dict[str, Any]:
        if self._backend is not None:
            return self._backend.health()
        return {
            "status": "ready",
            "queued_jobs": len([j for j in self._jobs.values() if j.status == "queued"]),
        }

    def clear(self) -> None:
        self._jobs.clear()


job_queue_service = JobQueueService()

