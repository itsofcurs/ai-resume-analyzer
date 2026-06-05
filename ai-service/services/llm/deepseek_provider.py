"""
services/llm/deepseek_provider.py
---------------------------------
Provider implementation for DeepSeek.
"""

import logging
from typing import Optional

from langchain_openai import ChatOpenAI
from langchain_core.runnables import Runnable

from core.config import get_settings
from services.llm.provider_interface import LLMProvider

logger = logging.getLogger(__name__)

class DeepSeekProvider(LLMProvider):
    """
    LLM Provider for DeepSeek.
    """

    def __init__(self):
        self._settings = get_settings()
        self._llm: Optional[ChatOpenAI] = None

    @property
    def provider_name(self) -> str:
        return "deepseek"

    def get_client(self) -> Runnable:
        """
        Return the configured ChatOpenAI client pointing to DeepSeek.
        """
        if self._llm is not None:
            return self._llm

        api_key = self._settings.deepseek_api_key
        if not api_key:
            raise ValueError(f"DEEPSEEK_API_KEY is missing for provider {self.provider_name}.")

        model_name = self._settings.deepseek_model

        try:
            self._llm = ChatOpenAI(
                model=model_name,
                api_key=api_key,
                base_url="https://api.deepseek.com",
                temperature=0.0,
                max_retries=1, # Let the fallback chain handle retries across providers
                request_timeout=self._settings.gemini_timeout_s,
            )
            logger.debug(f"{self.provider_name.capitalize()}Provider: LLM client ready ({model_name}).")
        except Exception as exc:
            logger.error(f"{self.provider_name.capitalize()}Provider: Failed to init LLM — {exc}")
            raise

        return self._llm
