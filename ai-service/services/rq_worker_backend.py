"""
services/rq_worker_backend.py
-----------------------------
Redis Queue (RQ) worker backend placeholder.

This file intentionally does NOT import rq to avoid adding runtime requirements.
"""

from __future__ import annotations

from typing import Any, Optional

from services.worker_backend import JobState, JobStatus, WorkerBackend


class RqWorkerBackend(WorkerBackend):
    def enqueue(self, job_type: str, payload: dict[str, Any]) -> str:
        raise NotImplementedError("RQ backend not enabled in this build.")

    def status(self, job_id: str) -> Optional[JobStatus]:
        return JobStatus(job_id=job_id, job_type="unknown", state=JobState.FAILED, failure_reason="rq_disabled")

    def cancel(self, job_id: str) -> bool:
        return False

    def health(self) -> dict[str, Any]:
        return {"backend": "rq", "status": "disabled"}

