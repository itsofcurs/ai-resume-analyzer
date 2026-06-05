"""
agents/resume_parser.py
------------------------
ResumeParserAgent — LangChain-powered structured resume extraction.

Architecture:
  ┌──────────────────────────────────────────────────────────────┐
  │                      ResumeParserAgent                       │
  │                                                              │
  │  raw_text ──► PromptTemplate ──► GeminiLLM ──► StrParser    │
  │                                                    │         │
  │                                              JSON string     │
  │                                                    │         │
  │                                            json.loads()      │
  │                                                    │         │
  │                                        ResumeParseResponse   │
  └──────────────────────────────────────────────────────────────┘

Design principles:
  - Single Responsibility: this agent ONLY parses raw resume text.
  - Uses the LangChain LCEL pipe syntax (prompt | llm | parser) for
    clean, readable, composable chains.
  - Graceful degradation: on any failure, returns a safe default
    ResumeParseResponse rather than propagating exceptions to callers.
  - Fully synchronous parse() method wraps the async LangChain invoke
    for compatibility with both sync and async calling contexts.

LangGraph readiness:
  - parse() is designed to become a LangGraph node that receives and
    returns a typed state dict in a future multi-agent workflow.
"""

import json
import logging
import asyncio
from typing import Optional

from langchain_core.output_parsers import StrOutputParser

from prompts.resume_parser_prompt import RESUME_PARSER_PROMPT, PROMPT_VERSION
from schemas.resume_schema import (
    ResumeParseResponse,
    ExperienceSchema,
    EducationSchema,
    ProjectSchema,
)
from services.gemini_service import GeminiServiceError
from services.llm.llm_router import LLMRouter
from utils.parser_utils import sanitize_name, clean_json_str, DEFAULT_PROMPT_CHAR_LIMIT
from utils.security_guardrails import prepare_llm_input, validate_resume_text

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Safe defaults returned when the pipeline fails
# ---------------------------------------------------------------------------

_FALLBACK_RESPONSE = ResumeParseResponse(
    name="Unknown Candidate",
    email=None,
    phone=None,
    skills=[],
    experience=[],
    education=[],
    projects=[],
    authenticity_score=90,
    ai_generated_probability=10,
    red_flags=[],
    technical_depth_score=80,
)


def _build_fallback(reason: str) -> ResumeParseResponse:
    """Return a safe default response and log the degradation reason."""
    logger.warning("ResumeParserAgent: using fallback response — %s", reason)
    return _FALLBACK_RESPONSE.model_copy()


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class ResumeParserAgent:
    """
    Agent that extracts structured information from raw resume text using
    a LangChain LCEL chain backed by Google Gemini.

    Attributes:
        _chain: The composed LangChain runnable (prompt | llm | str_parser).

    Methods:
        parse(raw_text: str) -> ResumeParseResponse
            Synchronous entry point. Calls aparse() on the running loop or
            runs it in a new event loop if called from a sync context.

        aparse(raw_text: str) -> ResumeParseResponse
            Async entry point. Preferred when called from async FastAPI routes.
    """

    def __init__(self) -> None:
        self._chain = None  # Lazily built on first call to avoid startup failures

    # -- Chain builder -------------------------------------------------------

    def _get_chain(self):
        """
        Lazily build and cache the LangChain LCEL chain.

        Chain: RESUME_PARSER_PROMPT | ChatGoogleGenerativeAI | StrOutputParser

        Raises:
            GeminiServiceError: If the Gemini service cannot be initialised.
        """
        if self._chain is not None:
            return self._chain

        self._llm = LLMRouter.get_llm("resume_parsing")
        self._chain = RESUME_PARSER_PROMPT | self._llm | StrOutputParser()
        logger.info(
            "ResumeParserAgent: LangChain chain built (prompt_version=%s).",
            PROMPT_VERSION,
        )
        return self._chain

    # -- JSON → Schema mapping -----------------------------------------------

    @staticmethod
    def _map_json_to_schema(data: dict, raw_text_length: int) -> ResumeParseResponse:
        """
        Map a raw parsed JSON dict from the LLM to a validated ResumeParseResponse.

        Handles list-of-dict sub-fields by constructing nested Pydantic models.
        Falls back to empty lists for any missing or malformed sub-sections.

        Args:
            data:            Parsed Python dict from json.loads().
            raw_text_length: Character count of the source text for metadata.

        Returns:
            A fully validated ResumeParseResponse instance.
        """
        # Build nested experience list
        experience: list[ExperienceSchema] = []
        for entry in data.get("experience", []) or []:
            if isinstance(entry, dict):
                experience.append(ExperienceSchema(**{
                    k: v for k, v in entry.items()
                    if k in ExperienceSchema.model_fields
                }))

        # Build nested education list
        education: list[EducationSchema] = []
        for entry in data.get("education", []) or []:
            if isinstance(entry, dict):
                education.append(EducationSchema(**{
                    k: v for k, v in entry.items()
                    if k in EducationSchema.model_fields
                }))

        # Build nested projects list
        projects: list[ProjectSchema] = []
        for entry in data.get("projects", []) or []:
            if isinstance(entry, dict):
                projects.append(ProjectSchema(**{
                    k: v for k, v in entry.items()
                    if k in ProjectSchema.model_fields
                }))

        # Sanitise the extracted name using centralised utility
        raw_name = data.get("name", "")
        clean_name = sanitize_name(str(raw_name))

        return ResumeParseResponse(
            name=clean_name,
            email=data.get("email") or None,
            phone=data.get("phone") or None,
            skills=data.get("skills") or [],
            experience=experience,
            education=education,
            projects=projects,
            authenticity_score=data.get("authenticity_score", 90),
            ai_generated_probability=data.get("ai_generated_probability", 10),
            red_flags=data.get("red_flags") or [],
            technical_depth_score=data.get("technical_depth_score", 80),
            raw_text_length=raw_text_length,
        )

    # -- Async parse ---------------------------------------------------------

    async def aparse(self, raw_text: str) -> ResumeParseResponse:
        """
        Asynchronously parse raw resume text into a structured ResumeParseResponse.

        This is the preferred entry point when called from async FastAPI handlers
        or async workflow methods.

        Args:
            raw_text: The full extracted text content of a resume.

        Returns:
            A validated ResumeParseResponse. Never raises — returns a safe
            fallback on any error to ensure pipeline continuity.
        """
        try:
            validate_resume_text(raw_text)
        except Exception as exc:
            return _build_fallback(str(exc))

        raw_text_length = len(raw_text)
        safe_text, injection_detected = prepare_llm_input(raw_text, max_chars=DEFAULT_PROMPT_CHAR_LIMIT)
        truncated = safe_text
        if injection_detected:
            logger.warning("ResumeParserAgent: prompt injection patterns detected and stripped.")

        try:
            chain = self._get_chain()
        except GeminiServiceError as exc:
            return _build_fallback(f"GeminiService unavailable: {exc}")

        try:
            logger.info(
                "ResumeParserAgent: invoking Gemini chain (text_length=%d, truncated=%d).",
                raw_text_length,
                len(truncated),
            )
            # LangChain LCEL async invoke
            raw_response: str = await chain.ainvoke({"resume_text": truncated})

        except Exception as exc:
            logger.error("ResumeParserAgent: Gemini chain invocation failed — %s", exc)
            return _build_fallback(f"LLM chain error: {exc}")

        # Clean markdown fences if present, then parse JSON
        cleaned_response = clean_json_str(raw_response)

        try:
            parsed_json: dict = json.loads(cleaned_response)
        except json.JSONDecodeError as exc:
            logger.error(
                "ResumeParserAgent: JSON decode failed — %s\nRaw response:\n%s",
                exc,
                cleaned_response[:500],
            )
            return _build_fallback(f"JSON parse error: {exc}")

        try:
            result = self._map_json_to_schema(parsed_json, raw_text_length)
            logger.info(
                "ResumeParserAgent: parsed '%s' — skills=%d, experience=%d, education=%d.",
                result.name,
                len(result.skills),
                len(result.experience),
                len(result.education),
            )
            return result

        except Exception as exc:
            logger.error("ResumeParserAgent: schema mapping failed — %s", exc)
            return _build_fallback(f"Schema mapping error: {exc}")

    # -- Sync parse (convenience wrapper) ------------------------------------

    def parse(self, raw_text: str) -> ResumeParseResponse:
        """
        Synchronous wrapper around aparse().

        Handles both scenarios:
          1. Called from within an already-running asyncio event loop
             (e.g. inside an async route handler that accidentally calls
             this sync method) — uses asyncio.ensure_future / loop.run.
          2. Called from a purely synchronous context — creates a new loop.

        Prefer aparse() in async contexts for better performance.

        Args:
            raw_text: The full extracted text content of a resume.

        Returns:
            A validated ResumeParseResponse.
        """
        try:
            loop = asyncio.get_running_loop()
            # We're inside an async context; schedule as a coroutine
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, self.aparse(raw_text))
                return future.result()
        except RuntimeError:
            # No running loop — safe to use asyncio.run()
            return asyncio.run(self.aparse(raw_text))
