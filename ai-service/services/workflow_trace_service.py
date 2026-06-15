"""
services/workflow_trace_service.py
----------------------------------
In-memory trace persistence for workflow runs.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class TraceEntry:
    trace_id: str
    workflow_id: str
    request_id: Optional[str]
    payload: dict[str, Any]
    created_at: float = field(default_factory=lambda: time.time())


class WorkflowTraceService:
    def __init__(self) -> None:
        self._traces: dict[str, TraceEntry] = {}

    def record_trace(
        self,
        *,
        workflow_id: str,
        request_id: Optional[str],
        payload: dict[str, Any],
    ) -> str:
        trace_id = payload.get("trace_id") or f"trace_{uuid.uuid4().hex}"
        entry = TraceEntry(
            trace_id=trace_id,
            workflow_id=workflow_id,
            request_id=request_id,
            payload=payload,
        )
        self._traces[trace_id] = entry
        return trace_id

    def get_trace(self, trace_id: str) -> Optional[TraceEntry]:
        return self._traces.get(trace_id)

    def get_traces_for_workflow(self, workflow_id: str) -> list[TraceEntry]:
        return [t for t in self._traces.values() if t.workflow_id == workflow_id]

    def clear(self) -> None:
        self._traces.clear()


workflow_trace_service = WorkflowTraceService()
