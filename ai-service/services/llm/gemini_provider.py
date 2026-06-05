"""
services/llm/gemini_provider.py
-------------------------------
Provider implementation for Google Gemini.
"""

import logging
from typing import Optional

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.runnables import Runnable

from core.config import get_settings
from services.llm.provider_interface import LLMProvider

logger = logging.getLogger(__name__)

class GeminiProvider(LLMProvider):
    """
    LLM Provider for Google Gemini.
    """

    def __init__(self):
        self._settings = get_settings()
        self._llm: Optional[ChatGoogleGenerativeAI] = None

    @property
    def provider_name(self) -> str:
        return "gemini"

    def get_client(self) -> Runnable:
        """
        Return the configured ChatGoogleGenerativeAI client.
        """
        if self._llm is not None:
            return self._llm

        api_key = self._settings.gemini_api_key
        if not api_key:
            raise ValueError(f"GEMINI_API_KEY is missing for provider {self.provider_name}.")

        model_name = self._settings.gemini_model

        try:
            self._llm = ChatGoogleGenerativeAI(
                model=model_name,
                google_api_key=api_key,
                temperature=0.0,
                timeout=self._settings.gemini_timeout_s,
                max_retries=self._settings.gemini_max_retries,
                convert_system_message_to_human=True,
            )
            logger.debug(f"{self.provider_name.capitalize()}Provider: LLM client ready ({model_name}).")
        except Exception as exc:
            logger.error(f"{self.provider_name.capitalize()}Provider: Failed to init LLM — {exc}")
            raise

        return self._llm
