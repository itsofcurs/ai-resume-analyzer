"""
workflows/job_match_workflow.py
-------------------------------
Hybrid Job Match Workflow.

Orchestration flow:
  1. Parse resume (ResumeParserAgent)
  2. Deterministic rule-based scoring
  3. Embedding similarity scoring (reuses existing embeddings)
  4. LLM reasoning layer (Gemini via LangChain) for explanation only
  5. Weighted aggregation of layer scores

This workflow is designed for future LangGraph integration but does NOT
introduce LangGraph dependencies yet.
"""

from __future__ import annotations

import logging

from agents.ats_scorer import ATSScoringAgent
from schemas.job_match_schema import (
    ATSWeightsSchema,
    FinalATSAnalysisSchema,
    JobMatchRequestSchema,
)

logger = logging.getLogger(__name__)


class JobMatchWorkflow:
    """
    A thin workflow wrapper around ATSScoringAgent.

    Kept separate so future pipelines (skill gap, ranking, interview generation)
    can be composed at workflow-level without changing agent logic.
    """

    _agent: ATSScoringAgent = ATSScoringAgent()

    async def run(self, req: JobMatchRequestSchema) -> FinalATSAnalysisSchema:
        """
        Execute hybrid ATS analysis for a single resume + job description pair.

        Uses async concurrency where appropriate: rule-based and embedding computations
        are CPU-bound and executed inside the agent synchronously today; the LLM call
        is async. If you later need heavy deterministic/embedding compute, migrate
        those to `asyncio.to_thread` inside the agent.
        """
        logger.info("JobMatchWorkflow: starting hybrid ATS analysis.")

        weights: ATSWeightsSchema = req.weights or ATSWeightsSchema()

        # Delegate to agent (single entry point)
        result = await self._agent.analyze(
            resume_text=req.resume_text,
            job_description_text=req.job_description_text,
            job_title=req.job_title,
            required_skills=req.required_skills,
            preferred_skills=req.preferred_skills,
            required_keywords=req.required_keywords,
            preferred_keywords=req.preferred_keywords,
            min_years_experience=req.min_years_experience,
            seniority=req.seniority,
            required_degrees=req.required_degrees,
            preferred_degrees=req.preferred_degrees,
            weights=weights,
        )

        logger.info(
            "JobMatchWorkflow: completed (final=%d rule=%d emb=%d conf=%d).",
            result.final_ats_score,
            result.rule_score,
            result.embedding_score,
            result.llm_confidence_score,
        )
        return result
