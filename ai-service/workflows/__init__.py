"""
workflows/
----------
Orchestration layer that coordinates agents, services, and storage.

Workflows are the entry point called by FastAPI route handlers.
They sequence agent calls, handle status transitions, and write
results to MongoDB and ChromaDB.

Current workflows:
  - ResumeWorkflow  → end-to-end: parse → embed → store → update status

Future workflows (LangGraph-ready):
  - ATSWorkflow          → match resume against a job description
  - MultiAgentWorkflow   → LangGraph StateGraph orchestration
"""

"""
Note on import safety:
This package avoids hard imports that can pull in optional heavy dependencies
at import time (e.g. `bson` via MongoDB drivers) to keep unit tests and
lightweight imports reliable.
"""

from workflows.job_match_workflow import JobMatchWorkflow
from workflows.batch_job_match_workflow import BatchJobMatchWorkflow

try:
    from workflows.resume_workflow import ResumeWorkflow  # noqa: F401
except Exception:  # pragma: no cover
    # ResumeWorkflow requires MongoDB/bson dependencies; keep package import safe.
    ResumeWorkflow = None  # type: ignore

__all__ = ["ResumeWorkflow", "JobMatchWorkflow", "BatchJobMatchWorkflow"]
