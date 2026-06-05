import asyncio
import logging
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)


def log_retry_attempt(retry_state):
    logger.warning(
        "Retrying LLM call due to %s... Attempt %d",
        retry_state.outcome.exception(),
        retry_state.attempt_number,
    )


# ---------------------------------------------------------------------------
# Async helper — wraps any chain.ainvoke() call with exponential backoff
# ---------------------------------------------------------------------------

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1.5, min=2, max=10),
    after=log_retry_attempt,
    reraise=True,
)
async def ainvoke_with_retry(chain, input_dict: dict):
    """Call chain.ainvoke(input_dict) with automatic retry on any error
    (rate limits, transient network issues, etc.)."""
    return await chain.ainvoke(input_dict)
