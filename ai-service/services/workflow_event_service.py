"""
services/workflow_event_service.py
----------------------------------
Event emitter abstraction for workflow progress tracking.
"""

from __future__ import annotations

import time
import uuid
from typing import Optional

from schemas.workflow_event_schema import WorkflowEventSchema, WorkflowState


class WorkflowEventService:
    def __init__(self) -> None:
        self._events: dict[str, list[WorkflowEventSchema]] = {}

    def emit(
        self,
        *,
        workflow_id: str,
        state: WorkflowState,
        request_id: Optional[str] = None,
        message: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> WorkflowEventSchema:
        event = WorkflowEventSchema(
            event_id=f"evt_{uuid.uuid4().hex}",
            workflow_id=workflow_id,
            request_id=request_id,
            state=state,
            timestamp_ms=int(time.time() * 1000),
            message=message,
            metadata=metadata or {},
        )
        self._events.setdefault(workflow_id, []).append(event)
        return event

    def list_events(self, workflow_id: str) -> list[WorkflowEventSchema]:
        return list(self._events.get(workflow_id, []))

    def latest_state(self, workflow_id: str) -> Optional[WorkflowState]:
        events = self._events.get(workflow_id, [])
        if not events:
            return None
        return events[-1].state

    def clear(self) -> None:
        self._events.clear()


workflow_event_service = WorkflowEventService()

