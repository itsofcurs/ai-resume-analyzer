"""
services/llm/llm_router.py
--------------------------
Router factory for the Provider-Agnostic Multi-LLM Layer.
"""

import logging
from typing import List

from langchain_core.runnables import Runnable
from services.llm.gemini_provider import GeminiProvider
from services.llm.groq_provider import GroqProvider
from services.llm.observability_callback import MultiLLMObservabilityCallback
from services.llm.openrouter_provider import OpenRouterProvider
from services.llm.provider_interface import LLMProvider

logger = logging.getLogger(__name__)


class LLMRouter:
    """
    Router that constructs a LangChain fallback chain for a specific task.
    """

    @classmethod
    def get_llm(cls, task: str) -> Runnable:
        """
        Returns a configured LLM Runnable with fallback capabilities.

        Routing Strategy:
        - ats_scoring, candidate_ranking, interview_generation, resume_parsing, copilot:
            -> Groq Primary => OpenRouter Fallback
        - comparison, recommendation:
            -> OpenRouter Primary => Groq Fallback
        - embeddings:
            -> handled in embeddings.py (Gemini ONLY)
        """

        # Instantiate providers
        try:
            groq = GroqProvider()
        except Exception:
            groq = None

        try:
            openrouter = OpenRouterProvider()
        except Exception:
            openrouter = None

        try:
            gemini = GeminiProvider()
        except Exception:
            gemini = None

        # Build list of available providers based on routing preference
        providers: List[LLMProvider] = []

        if task in [
            "ats_scoring",
            "candidate_ranking",
            "ranking",
            "interview_generation",
            "interview",
            "resume_parsing",
            "copilot",
        ]:
            preferred = [groq, openrouter, gemini]
        elif task in ["comparison", "recommendation"]:
            preferred = [openrouter, groq, gemini]
        else:
            preferred = [groq, openrouter, gemini]

        providers = [p for p in preferred if p is not None]

        if not providers:
            raise RuntimeError(
                "No LLM Providers available! Check API keys and configuration."
            )

        # Try to get the underlying LangChain client for each
        runnables: List[Runnable] = []
        for p in providers:
            try:
                runnables.append(p.get_client())
            except Exception as e:
                logger.warning(
                    f"Failed to instantiate client for provider {p.provider_name}: {e}"
                )

        if not runnables:
            raise RuntimeError("No LLM clients could be initialized.")

        # Primary is the first one
        primary_llm = runnables[0]
        fallbacks = runnables[1:]

        logger.info(
            f"LLMRouter [{task}]: Configured primary={providers[0].provider_name} with {len(fallbacks)} fallbacks."
        )

        chain = primary_llm
        if fallbacks:
            chain = primary_llm.with_fallbacks(fallbacks)

        # Attach observability callbacks
        return chain.with_config(callbacks=[MultiLLMObservabilityCallback()])
