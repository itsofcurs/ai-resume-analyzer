"""
services/rule_based_scorer.py
-----------------------------
Deterministic, recruiter-trust-friendly rule-based ATS scoring layer.

This layer MUST run before any LLM call and produces a transparent breakdown
that can be audited and tuned via weights.

Design goals:
  - Deterministic and fast (no network calls).
  - Explainable: returns sub-scores and missing requirements.
  - Configurable: weights are injected, never hardcoded in business logic.
  - Resilient to partial data: works with imperfect parsed resumes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Sequence

from schemas.resume_schema import ResumeParseResponse


@dataclass(frozen=True)
class RuleBasedScoringConfig:
    """
    Configuration for deterministic rule-based ATS scoring.

    All weights are expressed as percentages and should sum to 100 for easier
    interpretation, but the scorer will normalise if they do not.
    """

    skill_overlap_weight: float = 50.0
    experience_weight: float = 25.0
    education_weight: float = 15.0
    keyword_weight: float = 10.0

    # Keyword scoring behaviour
    keyword_required_weight: float = (
        0.7  # how much required keywords dominate keyword score
    )


def _normalise_tokens(values: Iterable[str]) -> set[str]:
    out: set[str] = set()
    for v in values:
        if not v:
            continue
        token = re.sub(r"\s+", " ", str(v)).strip().lower()
        if token:
            out.add(token)
    return out


def _clamp_pct(value: float) -> int:
    return int(max(0.0, min(100.0, value)))


def _weighted_average(items: Sequence[tuple[float, float]]) -> int:
    """
    Compute weighted average of (value, weight) pairs.
    Values and weights are 0..100-ish; weights can be any non-negative numbers.
    """
    total_w = sum(max(0.0, w) for _, w in items)
    if total_w <= 0:
        return 0
    score = sum(float(v) * max(0.0, w) for v, w in items) / total_w
    return _clamp_pct(score)


class RuleBasedScorer:
    """
    Deterministic scoring based on structured parsed resume data and job requirements.

    Inputs are intentionally simple (skills, keywords, requirements) so this service
    can be used with or without an LLM in the pipeline.
    """

    def __init__(self, config: RuleBasedScoringConfig | None = None) -> None:
        self._config = config or RuleBasedScoringConfig()

    @staticmethod
    def _skill_overlap_score(
        resume_skills: Sequence[str],
        required_skills: Sequence[str],
        preferred_skills: Sequence[str] | None = None,
    ) -> tuple[int, list[str]]:
        resume = _normalise_tokens(resume_skills)
        required = _normalise_tokens(required_skills)
        preferred = _normalise_tokens(preferred_skills or [])

        if not required and not preferred:
            return 0, []

        # Required overlap dominates; preferred is a bonus.
        req_overlap = (
            (len(resume & required) / len(required) * 100.0) if required else 0.0
        )
        pref_overlap = (
            (len(resume & preferred) / len(preferred) * 100.0) if preferred else 0.0
        )

        score = _weighted_average([(req_overlap, 0.8), (pref_overlap, 0.2)])
        missing_required = sorted(list(required - resume))
        return score, missing_required

    @staticmethod
    def _keyword_presence_score(
        resume_profile_text: str,
        required_keywords: Sequence[str],
        preferred_keywords: Sequence[str] | None = None,
        required_weight: float = 0.7,
    ) -> int:
        text = (resume_profile_text or "").lower()
        required = _normalise_tokens(required_keywords)
        preferred = _normalise_tokens(preferred_keywords or [])

        if not required and not preferred:
            return 0

        def present(k: str) -> bool:
            # word-boundary match for simple keywords, fallback to substring
            if re.fullmatch(r"[a-z0-9\+\#\.\- ]+", k):
                return (
                    re.search(rf"(^|[^a-z0-9]){re.escape(k)}([^a-z0-9]|$)", text)
                    is not None
                )
            return k in text

        req_hit = sum(1 for k in required if present(k))
        pref_hit = sum(1 for k in preferred if present(k))

        req_score = (req_hit / len(required) * 100.0) if required else 0.0
        pref_score = (pref_hit / len(preferred) * 100.0) if preferred else 0.0

        return _weighted_average(
            [(req_score, required_weight), (pref_score, 1.0 - required_weight)]
        )

    @staticmethod
    def _experience_match_score(
        resume: ResumeParseResponse,
        min_years_experience: float | None,
        seniority: str | None = None,
    ) -> int:
        """
        Heuristic experience match scoring.

        Because resumes are free-form, we avoid pretending we can parse exact years
        reliably from arbitrary text. We use two recruiter-friendly signals:
          - If a minimum is provided, estimate "role_count proxy" against it.
          - If seniority is provided, check alignment based on role keywords.
        """
        if min_years_experience is None and not seniority:
            return 0

        # Proxy 1: number of experience entries correlates with seniority/years
        role_count = len(resume.experience or [])
        if min_years_experience is not None:
            # Very conservative proxy: 1 role ≈ 1.5 years (not asserted, only scoring signal)
            est_years = role_count * 1.5
            years_score = (
                100.0
                if est_years >= float(min_years_experience)
                else (est_years / float(min_years_experience) * 100.0)
            )
        else:
            years_score = 0.0

        # Proxy 2: seniority keyword match from titles
        title_text = " ".join([e.role or "" for e in (resume.experience or [])]).lower()
        seniority_score = 0.0
        if seniority:
            s = seniority.strip().lower()
            if s in (
                "intern",
                "junior",
                "mid",
                "senior",
                "lead",
                "staff",
                "principal",
                "manager",
            ):
                cues = {
                    "intern": ["intern", "trainee"],
                    "junior": ["junior", "jr", "associate"],
                    "mid": ["software engineer", "developer", "engineer"],
                    "senior": ["senior", "sr", "sde ii", "sde2"],
                    "lead": ["lead", "tech lead"],
                    "staff": ["staff"],
                    "principal": ["principal"],
                    "manager": ["manager", "engineering manager"],
                }.get(s, [])
                seniority_score = (
                    100.0 if any(cue in title_text for cue in cues) else 50.0
                )
            else:
                seniority_score = 50.0

        if min_years_experience is not None and seniority:
            return _weighted_average([(years_score, 0.7), (seniority_score, 0.3)])
        if min_years_experience is not None:
            return _clamp_pct(years_score)
        return _clamp_pct(seniority_score)

    @staticmethod
    def _education_match_score(
        resume: ResumeParseResponse,
        required_degrees: Sequence[str] | None,
        preferred_degrees: Sequence[str] | None = None,
    ) -> int:
        if not (required_degrees or preferred_degrees):
            return 0

        edu_text = " ".join(
            [
                f"{e.degree or ''} {e.institution or ''}"
                for e in (resume.education or [])
            ]
        ).lower()

        required = _normalise_tokens(required_degrees or [])
        preferred = _normalise_tokens(preferred_degrees or [])

        def matches_any(tokens: set[str]) -> bool:
            return any(t in edu_text for t in tokens)

        # Required is binary-ish: if missing, penalise heavily.
        req_score = 100.0 if (not required or matches_any(required)) else 30.0
        pref_score = 100.0 if (not preferred or matches_any(preferred)) else 50.0
        return _weighted_average([(req_score, 0.8), (pref_score, 0.2)])

    def score(
        self,
        *,
        resume: ResumeParseResponse,
        required_skills: Sequence[str],
        preferred_skills: Sequence[str] | None = None,
        required_keywords: Sequence[str] | None = None,
        preferred_keywords: Sequence[str] | None = None,
        min_years_experience: float | None = None,
        seniority: str | None = None,
        required_degrees: Sequence[str] | None = None,
        preferred_degrees: Sequence[str] | None = None,
        resume_profile_text: str | None = None,
    ) -> dict:
        """
        Returns the deterministic score breakdown.

        Output is intentionally a plain dict to keep this service framework-agnostic;
        it is wrapped into Pydantic schemas by the workflow layer.
        """
        skill_overlap, missing_required_skills = self._skill_overlap_score(
            resume.skills or [],
            required_skills,
            preferred_skills,
        )

        exp_match = self._experience_match_score(
            resume,
            min_years_experience=min_years_experience,
            seniority=seniority,
        )

        edu_match = self._education_match_score(
            resume,
            required_degrees=required_degrees,
            preferred_degrees=preferred_degrees,
        )

        profile = resume_profile_text or self._build_resume_profile_text(resume)
        keyword_score = self._keyword_presence_score(
            profile,
            required_keywords or [],
            preferred_keywords,
            required_weight=self._config.keyword_required_weight,
        )

        rule_score = _weighted_average(
            [
                (skill_overlap, self._config.skill_overlap_weight),
                (exp_match, self._config.experience_weight),
                (edu_match, self._config.education_weight),
                (keyword_score, self._config.keyword_weight),
            ]
        )

        return {
            "rule_score": rule_score,
            "skill_overlap": skill_overlap,
            "experience_match": exp_match,
            "education_match": edu_match,
            "keyword_match": keyword_score,
            "missing_required_skills": missing_required_skills,
        }

    @staticmethod
    def _build_resume_profile_text(resume: ResumeParseResponse) -> str:
        """
        Create a compact text profile for deterministic keyword checks.
        Uses structured data rather than raw text to keep behaviour stable.
        """
        parts: list[str] = []
        parts.extend(resume.skills or [])
        for e in resume.experience or []:
            if e.role:
                parts.append(e.role)
            if e.company:
                parts.append(e.company)
            if e.description:
                parts.append(e.description)
        for p in resume.projects or []:
            if p.name:
                parts.append(p.name)
            if p.description:
                parts.append(p.description)
            parts.extend(p.tech_stack or [])
        for ed in resume.education or []:
            if ed.degree:
                parts.append(ed.degree)
            if ed.institution:
                parts.append(ed.institution)
        return "\n".join(parts)
