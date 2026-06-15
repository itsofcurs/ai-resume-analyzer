"""
services/celery_worker_backend.py
---------------------------------
Celery worker backend placeholder.

This file intentionally does NOT import Celery to avoid adding runtime
requirements until you decide to enable Celery.
"""

from __future__ import annotations

from typing import Any, Optional

from services.worker_backend import JobState, JobStatus, WorkerBackend


class CeleryWorkerBackend(WorkerBackend):
    def enqueue(self, job_type: str, payload: dict[str, Any]) -> str:
        raise NotImplementedError("Celery backend not enabled in this build.")

    def status(self, job_id: str) -> Optional[JobStatus]:
        return JobStatus(
            job_id=job_id,
            job_type="unknown",
            state=JobState.FAILED,
            failure_reason="celery_disabled",
        )

    def cancel(self, job_id: str) -> bool:
        return False

    def health(self) -> dict[str, Any]:
        return {"backend": "celery", "status": "disabled"}
