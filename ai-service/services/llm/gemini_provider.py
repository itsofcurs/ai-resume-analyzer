"""
services/llm/gemini_provider.py
-------------------------------
Provider implementation for Google Gemini.
"""

import itertools
import logging
import threading

from core.config import get_settings
from langchain_core.runnables import Runnable
from langchain_google_genai import ChatGoogleGenerativeAI
from services.llm.provider_interface import LLMProvider

logger = logging.getLogger(__name__)


class GeminiProvider(LLMProvider):
    """
    LLM Provider for Google Gemini.
    """

    def __init__(self):
        self._settings = get_settings()
        self._llms: list[ChatGoogleGenerativeAI] = []
        self._pool_iterator = None
        self._lock = threading.Lock()

    @property
    def provider_name(self) -> str:
        return "gemini"

    def get_client(self) -> Runnable:
        """
        Return the configured ChatGoogleGenerativeAI client.
        Uses a round-robin pool if multiple API keys are provided.
        """
        if self._llms:
            with self._lock:
                return next(self._pool_iterator)

        api_keys = self._settings.get_parsed_gemini_keys()
        if not api_keys:
            raise ValueError(
                f"GEMINI_API_KEY(S) is missing for provider {self.provider_name}."
            )

        model_name = self._settings.gemini_model

        try:
            for key in api_keys:
                llm = ChatGoogleGenerativeAI(
                    model=model_name,
                    google_api_key=key,
                    temperature=0.0,
                    timeout=self._settings.gemini_timeout_s,
                    max_retries=self._settings.gemini_max_retries,
                    convert_system_message_to_human=True,
                )
                self._llms.append(llm)

            self._pool_iterator = itertools.cycle(self._llms)
            logger.debug(
                f"{self.provider_name.capitalize()}Provider: LLM client pool ready ({len(self._llms)} keys, model={model_name})."
            )
        except Exception as exc:
            logger.error(
                f"{self.provider_name.capitalize()}Provider: Failed to init LLM pool — {exc}"
            )
            raise

        with self._lock:
            return next(self._pool_iterator)
