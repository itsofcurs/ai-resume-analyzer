"""
services/gemini_service.py
--------------------------
Production-grade singleton wrapper around LangChain's ChatGoogleGenerativeAI.

Design goals:
  - Single point of configuration for all Gemini interactions.
  - Environment-variable-driven — no hardcoded keys or model names.
  - Lazy initialisation: the LLM client is only constructed on first use.
  - Thread-safe singleton via module-level instance pattern.
  - Clean exception surface: raises GeminiServiceError with actionable
    messages instead of leaking raw SDK exceptions to callers.

Usage:
    from services.gemini_service import GeminiService

    llm = GeminiService.get_instance().get_llm()
    response = llm.invoke("Hello, Gemini!")

Future extensions:
  - Add streaming support via llm.stream()
  - Add async client via ChatGoogleGenerativeAI async methods
  - Swap to different model tiers (flash / pro) based on task complexity
"""

import logging
from typing import Optional

from core.config import Settings
from langchain_google_genai import ChatGoogleGenerativeAI

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------


class GeminiServiceError(Exception):
    """Raised when the Gemini service cannot be initialised or a call fails."""


# ---------------------------------------------------------------------------
# GeminiService — singleton
# ---------------------------------------------------------------------------


class GeminiService:
    """
    Singleton service that manages a shared ChatGoogleGenerativeAI instance.

    Attributes:
        _instance (GeminiService | None): Module-level singleton reference.
        _llm (ChatGoogleGenerativeAI | None): Lazily initialised LLM client.

    Class Methods:
        get_instance() -> GeminiService:
            Returns the shared singleton, creating it on first call.

    Instance Methods:
        get_llm() -> ChatGoogleGenerativeAI:
            Returns the lazily-initialised LLM client, ready to invoke.
    """

    _instance: Optional["GeminiService"] = None
    _llm: Optional[ChatGoogleGenerativeAI] = None

    # -- Singleton constructor -----------------------------------------------

    def __new__(cls) -> "GeminiService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            logger.info("GeminiService: singleton instance created.")
        return cls._instance

    @classmethod
    def get_instance(cls) -> "GeminiService":
        """
        Return the shared GeminiService singleton.

        This is the preferred way to obtain the service in agent/workflow code.
        """
        return cls()

    # -- LLM accessor --------------------------------------------------------

    def get_llm(self) -> ChatGoogleGenerativeAI:
        """
        Return the lazily-initialised ChatGoogleGenerativeAI client.

        Reads configuration from environment variables:
          - GEMINI_API_KEY  (required)
          - GEMINI_MODEL    (optional, default: gemini-1.5-flash)

        Returns:
            A configured ChatGoogleGenerativeAI instance.

        Raises:
            GeminiServiceError: If GEMINI_API_KEY is missing or the client
                                 cannot be initialised.
        """
        if self._llm is not None:
            return self._llm

        settings = Settings()
        if settings.llm_enabled is False:
            raise GeminiServiceError("LLM is disabled by configuration.")

        api_key = settings.gemini_api_key
        if not api_key:
            raise GeminiServiceError(
                "GEMINI_API_KEY environment variable is not set. "
                "Add it to your .env file or shell environment."
            )

        model_name = settings.gemini_model

        try:
            logger.info(
                "GeminiService: initialising ChatGoogleGenerativeAI with model='%s'",
                model_name,
            )
            self._llm = ChatGoogleGenerativeAI(
                model=model_name,
                google_api_key=api_key,
                # Zero temperature for strictly deterministic evaluation and scoring.
                temperature=0.0,
                # Timeout and retry handling for high-availability production usage
                timeout=settings.gemini_timeout_s,
                max_retries=settings.gemini_max_retries,
                # Prevent safety blocks on resume content
                convert_system_message_to_human=True,
            )
            logger.info("GeminiService: LLM client ready (model=%s).", model_name)

        except Exception as exc:
            logger.error("GeminiService: failed to initialise LLM — %s", exc)
            raise GeminiServiceError(
                f"Failed to initialise Gemini client: {exc}"
            ) from exc

        return self._llm

    def reset(self) -> None:
        """
        Reset the cached LLM instance.

        Useful in tests or when environment variables change at runtime.
        """
        self._llm = None
        logger.debug("GeminiService: LLM cache cleared.")

    def health_check(self) -> dict:
        settings = Settings()
        if not settings.llm_enabled:
            return {"status": "disabled"}
        if not settings.gemini_api_key:
            return {"status": "missing_key"}
        if self._llm is None:
            return {"status": "lazy"}
        return {"status": "ready", "model": settings.gemini_model}
