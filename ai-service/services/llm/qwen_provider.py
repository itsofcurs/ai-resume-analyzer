"""
services/llm/qwen_provider.py
-----------------------------
Provider implementation for Alibaba Qwen.
"""

import logging
from typing import Optional

from core.config import get_settings
from langchain_core.runnables import Runnable
from langchain_openai import ChatOpenAI
from services.llm.provider_interface import LLMProvider

logger = logging.getLogger(__name__)


class QwenProvider(LLMProvider):
    """
    LLM Provider for Alibaba Qwen.
    """

    def __init__(self):
        self._settings = get_settings()
        self._llm: Optional[ChatOpenAI] = None

    @property
    def provider_name(self) -> str:
        return "qwen"

    def get_client(self) -> Runnable:
        """
        Return the configured ChatOpenAI client pointing to Qwen.
        """
        if self._llm is not None:
            return self._llm

        api_key = self._settings.qwen_api_key
        if not api_key:
            raise ValueError(
                f"QWEN_API_KEY is missing for provider {self.provider_name}."
            )

        model_name = self._settings.qwen_model

        try:
            self._llm = ChatOpenAI(
                model=model_name,
                api_key=api_key,
                base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                temperature=0.0,
                max_retries=1,  # Let the fallback chain handle retries across providers
                request_timeout=self._settings.gemini_timeout_s,
            )
            logger.debug(
                f"{self.provider_name.capitalize()}Provider: LLM client ready ({model_name})."
            )
        except Exception as exc:
            logger.error(
                f"{self.provider_name.capitalize()}Provider: Failed to init LLM — {exc}"
            )
            raise

        return self._llm
