"""
schemas/workflow_event_schema.py
--------------------------------
Progress event contract for workflow state transitions.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


WorkflowState = Literal[
    "queued",
    "parsing",
    "scoring",
    "ranking",
    "aggregating",
    "completed",
    "failed",
]


class WorkflowEventSchema(BaseModel):
    event_id: str
    workflow_id: str
    request_id: Optional[str] = None
    state: WorkflowState
    timestamp_ms: int = Field(ge=0)
    message: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

