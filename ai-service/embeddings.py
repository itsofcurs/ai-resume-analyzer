from sentence_transformers import SentenceTransformer
import logging

from core.errors import EmbeddingError

logger = logging.getLogger(__name__)

# Initialize model globally to avoid reloading
try:
    # bge-small-en-v1.5 is extremely fast and effective for semantic search
    model = SentenceTransformer('BAAI/bge-small-en-v1.5')
except Exception as e:
    logger.error(f"Failed to load sentence transformer: {e}")
    model = None

def generate_embedding(text: str) -> list[float]:
    """Generate vector embedding for a given text."""
    if not model:
        raise EmbeddingError("SentenceTransformer model not loaded")
    
    # Truncate text if it's too long, bge-small-en-v1.5 has max sequence length of 512
    # In a full RAG pipeline, we would chunk this. For now, we take the first ~2000 chars
    truncated_text = text[:2000] 
    
    embeddings = model.encode(truncated_text)
    return embeddings.tolist()


def embedding_ready() -> bool:
    return model is not None
