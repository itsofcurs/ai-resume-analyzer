"""
services/llm/provider_interface.py
----------------------------------
Abstract base class for LLM providers.
"""

from abc import ABC, abstractmethod

from langchain_core.runnables import Runnable


class LLMProvider(ABC):
    """
    Abstract Base Class for an LLM Provider.
    """

    @abstractmethod
    def get_client(self) -> Runnable:
        """
        Return the configured LangChain LLM client (Runnable).
        """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """
        Return the name of the provider.
        """
