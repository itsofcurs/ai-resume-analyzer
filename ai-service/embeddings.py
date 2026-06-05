"""
embeddings.py
--------------
Vector embedding generation using Google Gemini Embedding API.

Replaces the previous sentence-transformers/PyTorch stack (~2.5 GB)
with a lightweight API call (~0 MB local install).

Model: gemini-embedding-2
Free tier: 1,500 requests/minute

Usage:
    from embeddings import generate_embedding, generate_query_embedding

    doc_vector = generate_embedding("resume text here")        # for storage
    query_vector = generate_query_embedding("search query")    # for search
"""

import logging
import os

import google.generativeai as genai

from core.config import get_settings
from core.errors import EmbeddingError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configure Gemini SDK Clients at module load
# ---------------------------------------------------------------------------
_settings = get_settings()

import itertools
import threading
from google.generativeai.client import get_default_generative_client

_clients = []
_pool_iterator = None
_lock = threading.Lock()
_configured = False

keys = _settings.get_parsed_gemini_keys()
if keys:
    for key in keys:
        try:
            # We must create a new client for each key
            # According to the source, we can pass `client` to embed_content directly
            # We initialize a GenerativeServiceClient directly to bypass global state.
            from google.generativeai.client import configure
            # We use an ugly hack to get a client: configure sets the global client,
            # so we save the previous state and restore it. The proper way is to use genai.Client
            # but older SDK versions don't have it.
            # However, embed_content takes a `client` object which is a GenerativeServiceClient
            # Let's import the raw grpc client:
            from google.generativeai import client as genai_client
            # the make_client function requires API key and returns a client
            c = genai_client.make_client(api_key=key)
            _clients.append(c)
        except Exception as e:
            logger.warning(f"Failed to initialize embedding client for a key: {e}")
            
    if _clients:
        _pool_iterator = itertools.cycle(_clients)
        _configured = True
        logger.info(f"Embeddings: Gemini API pool configured ({len(_clients)} keys, model=gemini-embedding-2)")
else:
    logger.warning("Embeddings: GEMINI_API_KEY(S) not set — embedding calls will fail")

EMBEDDING_MODEL = "models/gemini-embedding-2"


def generate_embedding(text: str) -> list[float]:
    """
    Generate a document embedding for storage/indexing.

    Uses task_type=RETRIEVAL_DOCUMENT for optimal retrieval performance.
    """
    if not _configured:
        raise EmbeddingError("Gemini API not configured — GEMINI_API_KEY is missing")

    # Truncate to ~8000 chars (gemini-embedding-2 supports up to 2048 tokens)
    truncated_text = text[:8000]

    try:
        with _lock:
            current_client = next(_pool_iterator)
            
        result = genai.embed_content(
            model=EMBEDDING_MODEL,
            content=truncated_text,
            task_type="RETRIEVAL_DOCUMENT",
            output_dimensionality=768,
            client=current_client
        )
        return result["embedding"]
    except Exception as exc:
        logger.error("Embedding generation failed: %s", exc)
        raise EmbeddingError(f"Embedding generation failed: {exc}") from exc


def generate_query_embedding(text: str) -> list[float]:
    """
    Generate a query embedding for semantic search.

    Uses task_type=RETRIEVAL_QUERY for optimal retrieval performance.
    """
    if not _configured:
        raise EmbeddingError("Gemini API not configured — GEMINI_API_KEY is missing")

    try:
        with _lock:
            current_client = next(_pool_iterator)

        result = genai.embed_content(
            model=EMBEDDING_MODEL,
            content=text[:2000],
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=768,
            client=current_client
        )
        return result["embedding"]
    except Exception as exc:
        logger.error("Query embedding generation failed: %s", exc)
        raise EmbeddingError(f"Query embedding generation failed: {exc}") from exc


def embedding_ready() -> bool:
    """Check if the embedding service is available."""
    return _configured
