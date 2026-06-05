"""
services/llm/openrouter_provider.py
-----------------------------------
Implements the LLMProvider interface using LangChain's ChatOpenAI
configured for the OpenRouter endpoint.
"""

import logging
from typing import Optional

from langchain_openai import ChatOpenAI
from core.config import get_settings
from services.llm.provider_interface import LLMProvider

logger = logging.getLogger(__name__)

class OpenRouterProvider(LLMProvider):
    """
    Provider for OpenRouter (OpenAI-compatible endpoint) via LangChain.
    """
    
    def __init__(self):
        self._settings = get_settings()
        self._llm: Optional[ChatOpenAI] = None
        
    @property
    def provider_name(self) -> str:
        return "openrouter"
        
    def get_client(self) -> ChatOpenAI:
        """
        Return the configured ChatOpenAI client pointing to OpenRouter.
        """
        if self._llm is not None:
            return self._llm
            
        if not self._settings.openrouter_api_key:
            raise ValueError("OpenRouterProvider requires OPENROUTER_API_KEY in environment or .env file.")
            
        logger.info(
            f"OpenRouterProvider: initialising ChatOpenAI with model='{self._settings.openrouter_model}'"
        )
        
        self._llm = ChatOpenAI(
            api_key=self._settings.openrouter_api_key,
            model=self._settings.openrouter_model,
            base_url="https://openrouter.ai/api/v1",
            temperature=0.0,
            max_retries=1
        )
        
        return self._llm
