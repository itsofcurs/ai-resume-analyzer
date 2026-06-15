"""
agents/ats_scorer.py
--------------------
Hybrid ATS Scoring Agent.

This agent implements the enterprise-grade hybrid architecture:
  1) Deterministic rule-based scoring (fast, explainable)
  2) Embedding similarity scoring (semantic match)
  3) LLM reasoning & explanation (NOT score generation)

The agent returns structured schemas that are safe to store and display.
"""

from __future__ import annotations

import json
import logging
import time

from agents.resume_parser import ResumeParserAgent
from langchain_core.output_parsers import StrOutputParser
from prompts.ats_reasoning_prompt import ATS_REASONING_PROMPT, PROMPT_VERSION
from schemas.job_match_schema import (
    ATSReasoningSchema,
    ATSWeightsSchema,
    EmbeddingScoreSchema,
    FinalATSAnalysisSchema,
    RuleBasedScoreSchema,
)
from schemas.resume_schema import ResumeParseResponse
from services.cache_service import CacheService, cache_service
from services.embedding_matcher import EmbeddingMatcher
from services.gemini_service import GeminiServiceError
from services.llm.llm_router import LLMRouter
from services.rule_based_scorer import RuleBasedScorer, RuleBasedScoringConfig

from utils.llm_output_guardrails import safe_json_parser
from utils.security_guardrails import prepare_llm_input

logger = logging.getLogger(__name__)


def _weighted_score(rule: int, emb: int, conf: int, weights: ATSWeightsSchema) -> int:
    score = (
        float(rule) * float(weights.rule_weight)
        + float(emb) * float(weights.embedding_weight)
        + float(conf) * float(weights.llm_confidence_weight)
    )
    return int(max(0.0, min(100.0, score)))


def _apply_recruiter_safety_caps(
    *,
    rule_score: int,
    embedding_score: int,
    llm_confidence: int,
    final_score: int,
) -> int:
    """
    Recruiter-safety normalisation.

    - Prevent unrealistic high final scores when deterministic signals are weak.
    - Keep LLM influence limited to confidence weighting (never score creation).
    """
    # If deterministic match is weak, cap high scores (prevents "too optimistic" outputs)
    if max(rule_score, embedding_score) < 55:
        return min(final_score, 60)

    # If LLM confidence is low, avoid exaggerated final scores.
    if llm_confidence < 40:
        return min(final_score, max(rule_score, embedding_score))

    # General cap to keep outputs conservative; recruiters can still override manually.
    return min(final_score, 95)


class ATSScoringAgent:
    """
    High-level agent producing a unified hybrid ATS analysis.

    Note: The workflow layer typically calls this agent and provides input values.
    """

    def __init__(
        self,
        *,
        rule_config: RuleBasedScoringConfig | None = None,
        cache: CacheService | None = None,
    ) -> None:
        self._resume_parser = ResumeParserAgent()
        self._rule_scorer = RuleBasedScorer(config=rule_config)
        self._embedding_matcher = EmbeddingMatcher()
        self._cache = cache or cache_service
        self._reasoning_chain = None  # lazy

    def _get_reasoning_chain(self):
        if self._reasoning_chain is not None:
            return self._reasoning_chain
        llm = LLMRouter.get_llm("ats_scoring")
        # PromptTemplate -> Gemini -> string output
        self._reasoning_chain = ATS_REASONING_PROMPT | llm | StrOutputParser()
        logger.info(
            "ATSScoringAgent: reasoning chain built (prompt_version=%s).",
            PROMPT_VERSION,
        )
        return self._reasoning_chain

    async def analyze(
        self,
        *,
        resume_text: str,
        job_description_text: str,
        job_title: str | None = None,
        required_skills: list[str] | None = None,
        preferred_skills: list[str] | None = None,
        required_keywords: list[str] | None = None,
        preferred_keywords: list[str] | None = None,
        min_years_experience: float | None = None,
        seniority: str | None = None,
        required_degrees: list[str] | None = None,
        preferred_degrees: list[str] | None = None,
        weights: ATSWeightsSchema | None = None,
    ) -> FinalATSAnalysisSchema:
        """
        Run the full hybrid ATS pipeline and return the unified analysis.

        The LLM is only used for explanation and confidence; scoring comes from
        deterministic and embedding layers.
        """
        weights = weights or ATSWeightsSchema()
        required_skills = required_skills or []
        preferred_skills = preferred_skills or []
        required_keywords = required_keywords or []
        preferred_keywords = preferred_keywords or []
        required_degrees = required_degrees or []
        preferred_degrees = preferred_degrees or []

        timings: dict[str, int] = {}

        weights_signature = json.dumps(weights.model_dump(), sort_keys=True)
        cached_ats = self._cache.get_cached_ats(
            resume_text,
            job_description_text,
            weights_signature=weights_signature,
        )
        if cached_ats is not None:
            cached_ats.stage_timings_ms = cached_ats.stage_timings_ms or {}
            cached_ats.stage_timings_ms["cache_hit"] = 1
            return cached_ats

        # 1) Parse resume into structured schema
        cached_resume = self._cache.get_cached_resume(resume_text)
        if cached_resume is not None:
            parsed_resume = cached_resume
            timings["parse_ms"] = 0
        else:
            t0 = time.perf_counter()
            parsed_resume = await self._resume_parser.aparse(resume_text)
            timings["parse_ms"] = int((time.perf_counter() - t0) * 1000)
            self._cache.set_cached_resume(resume_text, parsed_resume)

        return await self._analyze_with_parsed(
            resume_text=resume_text,
            parsed_resume=parsed_resume,
            job_description_text=job_description_text,
            job_title=job_title,
            required_skills=required_skills,
            preferred_skills=preferred_skills,
            required_keywords=required_keywords,
            preferred_keywords=preferred_keywords,
            min_years_experience=min_years_experience,
            seniority=seniority,
            required_degrees=required_degrees,
            preferred_degrees=preferred_degrees,
            weights=weights,
            timings=timings,
        )

    async def analyze_with_parsed(
        self,
        *,
        resume_text: str,
        parsed_resume: ResumeParseResponse,
        job_description_text: str,
        job_title: str | None = None,
        required_skills: list[str] | None = None,
        preferred_skills: list[str] | None = None,
        required_keywords: list[str] | None = None,
        preferred_keywords: list[str] | None = None,
        min_years_experience: float | None = None,
        seniority: str | None = None,
        required_degrees: list[str] | None = None,
        preferred_degrees: list[str] | None = None,
        weights: ATSWeightsSchema | None = None,
        parse_ms: int | None = None,
    ) -> FinalATSAnalysisSchema:
        """
        Run the hybrid ATS pipeline using a pre-parsed resume (non-breaking extension).
        """
        weights = weights or ATSWeightsSchema()
        required_skills = required_skills or []
        preferred_skills = preferred_skills or []
        required_keywords = required_keywords or []
        preferred_keywords = preferred_keywords or []
        required_degrees = required_degrees or []
        preferred_degrees = preferred_degrees or []

        timings: dict[str, int] = {}
        if parse_ms is not None:
            timings["parse_ms"] = int(parse_ms)

        weights_signature = json.dumps(weights.model_dump(), sort_keys=True)
        cached_ats = self._cache.get_cached_ats(
            resume_text,
            job_description_text,
            weights_signature=weights_signature,
        )
        if cached_ats is not None:
            if cached_ats.parsed_resume is None:
                cached_ats.parsed_resume = parsed_resume
            cached_ats.stage_timings_ms = cached_ats.stage_timings_ms or {}
            if parse_ms is not None:
                cached_ats.stage_timings_ms["parse_ms"] = int(parse_ms)
            cached_ats.stage_timings_ms["cache_hit"] = 1
            return cached_ats

        return await self._analyze_with_parsed(
            resume_text=resume_text,
            parsed_resume=parsed_resume,
            job_description_text=job_description_text,
            job_title=job_title,
            required_skills=required_skills,
            preferred_skills=preferred_skills,
            required_keywords=required_keywords,
            preferred_keywords=preferred_keywords,
            min_years_experience=min_years_experience,
            seniority=seniority,
            required_degrees=required_degrees,
            preferred_degrees=preferred_degrees,
            weights=weights,
            timings=timings,
        )

    async def _analyze_with_parsed(
        self,
        *,
        resume_text: str,
        parsed_resume: ResumeParseResponse,
        job_description_text: str,
        job_title: str | None,
        required_skills: list[str],
        preferred_skills: list[str],
        required_keywords: list[str],
        preferred_keywords: list[str],
        min_years_experience: float | None,
        seniority: str | None,
        required_degrees: list[str],
        preferred_degrees: list[str],
        weights: ATSWeightsSchema,
        timings: dict[str, int],
    ) -> FinalATSAnalysisSchema:
        # Recruiter safety: reduce hallucinated skills by requiring evidence in resume_text.
        resume_text_lower = resume_text.lower()
        if parsed_resume.skills:
            filtered = []
            for s in parsed_resume.skills:
                token = str(s).strip()
                if not token:
                    continue
                if token.lower() in resume_text_lower:
                    filtered.append(token)
            # Keep filtered list only if it doesn't wipe out everything (avoid over-pruning)
            if filtered:
                parsed_resume.skills = filtered

        # 2) Deterministic scoring
        t1 = time.perf_counter()
        rule_dict = self._rule_scorer.score(
            resume=parsed_resume,
            required_skills=required_skills,
            preferred_skills=preferred_skills,
            required_keywords=required_keywords,
            preferred_keywords=preferred_keywords,
            min_years_experience=min_years_experience,
            seniority=seniority,
            required_degrees=required_degrees,
            preferred_degrees=preferred_degrees,
        )
        rule_breakdown = RuleBasedScoreSchema(**rule_dict)
        timings["rule_ms"] = int((time.perf_counter() - t1) * 1000)

        # 3) Embedding similarity scoring
        t2 = time.perf_counter()
        emb_dict = self._embedding_matcher.score(
            resume=parsed_resume,
            job_description_text=job_description_text,
            job_title=job_title,
            required_skills=required_skills,
            preferred_skills=preferred_skills,
            domain_keywords=required_keywords,
        )
        embedding_breakdown = EmbeddingScoreSchema(**emb_dict)
        timings["embedding_ms"] = int((time.perf_counter() - t2) * 1000)

        # 4) LLM reasoning (consumes deterministic outputs)
        reasoning = ATSReasoningSchema()
        try:
            t3 = time.perf_counter()
            chain = self._get_reasoning_chain()
            safe_job_text, job_injection = prepare_llm_input(job_description_text)
            if job_injection:
                logger.warning(
                    "ATSScoringAgent: prompt injection patterns detected in job description."
                )
            payload = {
                "job_description_text": safe_job_text,
                "resume_json": json.dumps(
                    parsed_resume.model_dump(exclude_none=True), ensure_ascii=False
                ),
                "rule_score_json": json.dumps(
                    rule_breakdown.model_dump(), ensure_ascii=False
                ),
                "embedding_score_json": json.dumps(
                    embedding_breakdown.model_dump(), ensure_ascii=False
                ),
                "weights_json": json.dumps(weights.model_dump(), ensure_ascii=False),
            }

            raw = await chain.ainvoke(payload)
            parsed = safe_json_parser(raw)
            if not parsed.ok:
                # Auto-retry once if parsing fails
                raw_retry = await chain.ainvoke(payload)
                parsed = safe_json_parser(raw_retry)

            if parsed.ok and parsed.data is not None:
                reasoning = ATSReasoningSchema(**parsed.data)
            else:
                logger.warning(
                    "ATSScoringAgent: reasoning degraded (parse_error=%s).",
                    parsed.error,
                )

            timings["llm_ms"] = int((time.perf_counter() - t3) * 1000)

        except GeminiServiceError as exc:
            logger.warning("ATSScoringAgent: reasoning degraded (%s).", exc)
        except Exception as exc:
            logger.error("ATSScoringAgent: reasoning failed (%s).", exc)

        # 5) Weighted aggregation
        final = _weighted_score(
            rule_breakdown.rule_score,
            embedding_breakdown.embedding_similarity_score,
            reasoning.llm_confidence_score,
            weights,
        )
        final = _apply_recruiter_safety_caps(
            rule_score=rule_breakdown.rule_score,
            embedding_score=embedding_breakdown.embedding_similarity_score,
            llm_confidence=reasoning.llm_confidence_score,
            final_score=final,
        )

        result = FinalATSAnalysisSchema(
            final_ats_score=final,
            rule_score=rule_breakdown.rule_score,
            embedding_score=embedding_breakdown.embedding_similarity_score,
            llm_confidence_score=reasoning.llm_confidence_score,
            rule_breakdown=rule_breakdown,
            embedding_breakdown=embedding_breakdown,
            reasoning=reasoning,
            parsed_resume=parsed_resume,
            stage_timings_ms=timings,
        )
        weights_signature = json.dumps(weights.model_dump(), sort_keys=True)
        self._cache.set_cached_ats(
            resume_text,
            job_description_text,
            result,
            weights_signature=weights_signature,
        )
        return result
