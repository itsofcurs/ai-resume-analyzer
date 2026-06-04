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
# Configure Gemini SDK at module load
# ---------------------------------------------------------------------------
_settings = get_settings()
_configured = False

if _settings.gemini_api_key:
    genai.configure(api_key=_settings.gemini_api_key)
    _configured = True
    logger.info("Embeddings: Gemini API configured (model=gemini-embedding-2)")
else:
    logger.warning("Embeddings: GEMINI_API_KEY not set — embedding calls will fail")

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
        result = genai.embed_content(
            model=EMBEDDING_MODEL,
            content=truncated_text,
            task_type="RETRIEVAL_DOCUMENT",
            output_dimensionality=768
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
        result = genai.embed_content(
            model=EMBEDDING_MODEL,
            content=text[:2000],
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=768
        )
        return result["embedding"]
    except Exception as exc:
        logger.error("Query embedding generation failed: %s", exc)
        raise EmbeddingError(f"Query embedding generation failed: {exc}") from exc


def embedding_ready() -> bool:
    """Check if the embedding service is available."""
    return _configured
