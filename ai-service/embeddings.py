"""
embeddings.py
--------------
Vector embedding generation using Google Gemini REST API.

Replaces the buggy gRPC legacy SDK instantiation with a fast, lightweight
httpx REST request, implementing round-robin API key rotation to handle 
rate limits across multiple keys seamlessly.

Model: gemini-embedding-2
Free tier: 1,500 requests/minute
"""

import logging
import itertools
import threading
import httpx

from core.config import get_settings
from core.errors import EmbeddingError

logger = logging.getLogger(__name__)

_settings = get_settings()

_keys = []
_pool_iterator = None
_lock = threading.Lock()
_configured = False

keys = _settings.get_parsed_gemini_keys()
if keys:
    _keys = keys
    _pool_iterator = itertools.cycle(_keys)
    _configured = True
    logger.info(f"Embeddings: REST API pool configured ({len(_keys)} keys, model=gemini-embedding-2)")
else:
    logger.warning("Embeddings: GEMINI_API_KEY(S) not set — embedding calls will fail")

EMBEDDING_MODEL = "models/gemini-embedding-2"
API_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/{model}:embedContent?key={key}"

def _do_rest_call(text: str, task_type: str) -> list[float]:
    if not _configured:
        raise EmbeddingError("Gemini API not configured — GEMINI_API_KEY is missing")

    with _lock:
        current_key = next(_pool_iterator)

    url = API_URL_TEMPLATE.format(model=EMBEDDING_MODEL, key=current_key)
    payload = {
        "model": EMBEDDING_MODEL,
        "content": {
            "parts": [{"text": text}]
        },
        "taskType": task_type,
        "outputDimensionality": 768
    }

    try:
        # httpx post with a short timeout.
        # If it fails, we throw an Exception which gets caught by the caller
        with httpx.Client(timeout=15.0) as client:
            response = client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            if "embedding" in data and "values" in data["embedding"]:
                return data["embedding"]["values"]
            else:
                raise ValueError(f"Unexpected response schema: {data}")
    except Exception as exc:
        logger.error("Embedding REST generation failed: %s", exc)
        raise EmbeddingError(f"Embedding REST generation failed: {exc}") from exc


def generate_embedding(text: str) -> list[float]:
    """
    Generate a document embedding for storage/indexing.
    Uses task_type=RETRIEVAL_DOCUMENT for optimal retrieval performance.
    """
    # Truncate to ~8000 chars
    truncated_text = text[:8000]
    return _do_rest_call(truncated_text, "RETRIEVAL_DOCUMENT")


def generate_query_embedding(text: str) -> list[float]:
    """
    Generate a query embedding for semantic search.
    Uses task_type=RETRIEVAL_QUERY for optimal retrieval performance.
    """
    # Truncate to ~2000 chars for query
    truncated_text = text[:2000]
    return _do_rest_call(truncated_text, "RETRIEVAL_QUERY")


def embedding_ready() -> bool:
    """Check if the embedding service is available."""
    return _configured
