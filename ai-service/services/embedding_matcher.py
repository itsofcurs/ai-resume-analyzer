"""
services/embedding_matcher.py
-----------------------------
Semantic similarity scoring layer for ATS matching.

This layer reuses the existing embedding infrastructure (`embeddings.generate_embedding`)
and does NOT introduce a second vector stack.

Responsibilities:
  - Build stable, compact text representations from structured resume/job data.
  - Compute cosine similarity between BAAI/bge embeddings.
  - Produce a recruiter-friendly semantic alignment summary.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

from schemas.resume_schema import ResumeParseResponse
from utils.parser_utils import truncate_text, DEFAULT_EMBEDDING_CHAR_LIMIT
from services.cache_service import CacheService, cache_service


@dataclass(frozen=True)
class EmbeddingMatcherConfig:
    """
    Configuration for embedding similarity scoring.

    `max_chars` exists because sentence-transformers models have limited context.
    """

    max_chars: int = DEFAULT_EMBEDDING_CHAR_LIMIT


def _cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(float(x) * float(y) for x, y in zip(a, b))
    na = math.sqrt(sum(float(x) * float(x) for x in a))
    nb = math.sqrt(sum(float(y) * float(y) for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def _similarity_to_score(sim: float) -> int:
    """
    Convert cosine similarity (-1..1) to a 0..100 score.
    In practice, BGE similarities are usually in [0.2, 0.9] for real pairs.
    """
    # map [-1, 1] → [0, 100]
    return int(max(0.0, min(100.0, (sim + 1.0) * 50.0)))


class EmbeddingMatcher:
    def __init__(
        self,
        config: EmbeddingMatcherConfig | None = None,
        *,
        cache: CacheService | None = None,
    ) -> None:
        self._config = config or EmbeddingMatcherConfig()
        self._cache = cache or cache_service

    def score(
        self,
        *,
        resume: ResumeParseResponse,
        job_description_text: str,
        job_title: str | None = None,
        required_skills: Sequence[str] | None = None,
        preferred_skills: Sequence[str] | None = None,
        domain_keywords: Sequence[str] | None = None,
    ) -> dict:
        """
        Compute embedding similarity between resume profile and job description.

        Returns:
            {
              "embedding_similarity_score": int,
              "cosine_similarity": float,
              "semantic_alignment": str
            }
        """
        resume_text = self._build_resume_semantic_text(resume)
        jd_text = self._build_job_semantic_text(
            job_description_text=job_description_text,
            job_title=job_title,
            required_skills=required_skills,
            preferred_skills=preferred_skills,
            domain_keywords=domain_keywords,
        )

        resume_text = truncate_text(resume_text, max_chars=self._config.max_chars)
        jd_text = truncate_text(jd_text, max_chars=self._config.max_chars)

        # Lazy import to avoid loading heavy models at import time and to keep
        # unit tests fast (tests can monkeypatch this symbol via the module).
        from embeddings import generate_embedding

        resume_vec = self._cache.get_cached_embedding(resume_text)
        if resume_vec is None:
            resume_vec = generate_embedding(resume_text)
            self._cache.set_cached_embedding(resume_text, resume_vec)

        jd_vec = self._cache.get_cached_embedding(jd_text)
        if jd_vec is None:
            jd_vec = generate_embedding(jd_text)
            self._cache.set_cached_embedding(jd_text, jd_vec)

        sim = _cosine_similarity(resume_vec, jd_vec)
        score = _similarity_to_score(sim)

        if score >= 85:
            alignment = "Strong semantic alignment between resume and job description."
        elif score >= 70:
            alignment = "Good semantic alignment with some potential gaps."
        elif score >= 55:
            alignment = "Moderate semantic alignment; likely requires screening."
        else:
            alignment = "Low semantic alignment; likely not a close match."

        return {
            "embedding_similarity_score": score,
            "cosine_similarity": float(sim),
            "semantic_alignment": alignment,
        }

    @staticmethod
    def _build_resume_semantic_text(resume: ResumeParseResponse) -> str:
        parts: list[str] = []
        if resume.name:
            parts.append(f"Candidate: {resume.name}")
        if resume.skills:
            parts.append("Skills: " + ", ".join(resume.skills))
        if resume.experience:
            parts.append("Experience:")
            for e in resume.experience[:6]:
                line = " - ".join([p for p in [e.role, e.company, e.duration] if p])
                if line:
                    parts.append(line)
                if e.description:
                    parts.append(e.description)
        if resume.projects:
            parts.append("Projects:")
            for p in resume.projects[:6]:
                if p.name:
                    parts.append(p.name)
                if p.description:
                    parts.append(p.description)
                if p.tech_stack:
                    parts.append("Tech: " + ", ".join(p.tech_stack))
        if resume.education:
            parts.append("Education:")
            for ed in resume.education[:4]:
                line = " - ".join([p for p in [ed.degree, ed.institution, ed.year] if p])
                if line:
                    parts.append(line)
        return "\n".join(parts)

    @staticmethod
    def _build_job_semantic_text(
        *,
        job_description_text: str,
        job_title: str | None,
        required_skills: Sequence[str] | None,
        preferred_skills: Sequence[str] | None,
        domain_keywords: Sequence[str] | None,
    ) -> str:
        parts: list[str] = []
        if job_title:
            parts.append(f"Job Title: {job_title}")
        if required_skills:
            parts.append("Required Skills: " + ", ".join([str(s) for s in required_skills if s]))
        if preferred_skills:
            parts.append("Preferred Skills: " + ", ".join([str(s) for s in preferred_skills if s]))
        if domain_keywords:
            parts.append("Domain Keywords: " + ", ".join([str(s) for s in domain_keywords if s]))
        if job_description_text:
            parts.append("Job Description:\n" + job_description_text)
        return "\n".join(parts)
