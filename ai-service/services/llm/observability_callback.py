"""
services/llm/observability_callback.py
--------------------------------------
Callback handler for tracing Multi-LLM performance and failovers.
"""

import logging
import time
from typing import Any, Dict, List, Optional
from uuid import UUID

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult

logger = logging.getLogger(__name__)

class MultiLLMObservabilityCallback(BaseCallbackHandler):
    """
    Observability callback for LLMRouter fallbacks and metrics.
    """

    def __init__(self):
        super().__init__()
        self.start_times: Dict[UUID, float] = {}
        self.provider_names: Dict[UUID, str] = {}

    def on_llm_start(
        self,
        serialized: Dict[str, Any],
        prompts: List[str],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        self.start_times[run_id] = time.time()
        # Attempt to determine provider from class name
        class_name = serialized.get("id", [""])[-1]
        provider = "unknown"
        if "Google" in class_name:
            provider = "Gemini"
        elif "OpenAI" in class_name:
            # Check model name or just log as OpenAI compatible
            kwargs_dict = kwargs.get("invocation_params", {})
            model = kwargs_dict.get("model_name", "")
            if "deepseek" in model.lower():
                provider = "DeepSeek"
            elif "qwen" in model.lower():
                provider = "Qwen"
            else:
                provider = f"OpenAI-compat ({model})"
                
        self.provider_names[run_id] = provider
        logger.info(f"[LLM Start] Provider: {provider} | Run ID: {run_id}")

    def on_llm_end(
        self,
        response: LLMResult,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> Any:
        start_time = self.start_times.pop(run_id, None)
        provider = self.provider_names.pop(run_id, "unknown")
        
        latency = (time.time() - start_time) if start_time else 0.0
        
        # Extract token usage if available
        tokens = "unknown"
        if response.llm_output and "token_usage" in response.llm_output:
            tokens = response.llm_output["token_usage"]
            
        logger.info(
            f"[LLM End] Provider: {provider} | Latency: {latency:.2f}s | "
            f"Tokens: {tokens} | Run ID: {run_id}"
        )

    def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> Any:
        start_time = self.start_times.pop(run_id, None)
        provider = self.provider_names.pop(run_id, "unknown")
        
        latency = (time.time() - start_time) if start_time else 0.0
        
        logger.warning(
            f"[LLM Error/Failover] Provider: {provider} failed after {latency:.2f}s | "
            f"Error: {str(error)} | Run ID: {run_id}"
        )
