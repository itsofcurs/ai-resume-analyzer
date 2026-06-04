import logging
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

def log_retry_attempt(retry_state):
    logger.warning(
        f"Retrying LLM call due to {retry_state.outcome.exception()}... "
        f"Attempt {retry_state.attempt_number}"
    )

# Common retry decorator for LLM calls (e.g. Rate limits, timeouts)
with_llm_retry = retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=4, max=60),
    after=log_retry_attempt,
    reraise=True
)
