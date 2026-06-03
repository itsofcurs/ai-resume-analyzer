"""
services/worker_backend.py
--------------------------
Pluggable worker backend interfaces for distributed job execution.

This is architecture-only: implementations can be Celery, RQ, Kafka, etc.
The API layer and workflows must depend ONLY on this abstraction.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional, Protocol


class JobState(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMEOUT = "TIMEOUT"


@dataclass
class JobStatus:
    job_id: str
    job_type: str
    state: JobState
    retry_count: int = 0
    failure_reason: Optional[str] = None
    worker_id: Optional[str] = None
    queued_at_ms: int = field(default_factory=lambda: int(time.time() * 1000))
    started_at_ms: Optional[int] = None
    finished_at_ms: Optional[int] = None
    duration_ms: Optional[int] = None


class WorkerBackend(Protocol):
    def enqueue(self, job_type: str, payload: dict[str, Any]) -> str: ...
    def status(self, job_id: str) -> Optional[JobStatus]: ...
    def cancel(self, job_id: str) -> bool: ...
    def health(self) -> dict[str, Any]: ...

