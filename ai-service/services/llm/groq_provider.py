"""
services/llm/groq_provider.py
-----------------------------
Implements the LLMProvider interface using LangChain's ChatGroq.
"""

import logging
from typing import Optional

from langchain_groq import ChatGroq
from core.config import get_settings
from services.llm.provider_interface import LLMProvider

logger = logging.getLogger(__name__)

class GroqProvider(LLMProvider):
    """
    Provider for Groq LLMs via LangChain.
    """
    
    def __init__(self):
        self._settings = get_settings()
        self._llm: Optional[ChatGroq] = None
        
    @property
    def provider_name(self) -> str:
        return "groq"
        
    def get_client(self) -> ChatGroq:
        """
        Return the configured ChatGroq client.
        """
        if self._llm is not None:
            return self._llm
            
        if not self._settings.groq_api_key:
            raise ValueError("GroqProvider requires GROQ_API_KEY in environment or .env file.")
            
        logger.info(
            f"GroqProvider: initialising ChatGroq with model='{self._settings.groq_model}'"
        )
        
        self._llm = ChatGroq(
            api_key=self._settings.groq_api_key,
            model=self._settings.groq_model,
            temperature=0.0,
            max_retries=1
        )
        
        return self._llm
