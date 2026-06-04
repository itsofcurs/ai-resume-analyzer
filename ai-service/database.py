"""
database.py
-----------
Database connection management for MongoDB (primary store + vector search).

ChromaDB has been replaced with MongoDB Atlas Vector Search — embeddings
are stored directly in the resume document and searched via $vectorSearch
aggregation pipeline.

Prerequisites:
    Create a vector search index on MongoDB Atlas:
    - Collection: resumes
    - Index name: vector_index
    - Field mapping:
        {
          "fields": [
            {
              "type": "vector",
              "path": "embedding",
              "numDimensions": 768,
              "similarity": "cosine"
            }
          ]
        }
"""

import logging
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

from core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

MONGODB_URI = settings.mongodb_uri

# ---------------------------------------------------------------------------
# MongoDB Setup
# ---------------------------------------------------------------------------
mongo_client = AsyncIOMotorClient(MONGODB_URI)
db = mongo_client.get_database("talentdb")
resumes_collection = db.get_collection("resumes")


def get_mongo_collection():
    """Return the resumes MongoDB collection."""
    return resumes_collection


# ---------------------------------------------------------------------------
# MongoDB Health Check
# ---------------------------------------------------------------------------
async def mongo_health_check() -> bool:
    try:
        await mongo_client.admin.command("ping")
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Vector Storage (in MongoDB documents)
# ---------------------------------------------------------------------------
async def store_vector(
    resume_id: str,
    vector: list[float],
    filename: str,
    name: str,
    skills: list[str],
) -> bool:
    """
    Store the embedding vector directly in the resume MongoDB document.

    Args:
        resume_id: MongoDB ObjectId string.
        vector: Embedding vector (768-dim from Gemini text-embedding-004).
        filename: Original filename for metadata.
        name: Parsed candidate name.
        skills: Parsed skills list.

    Returns:
        True on success, False on failure.
    """
    try:
        await resumes_collection.update_one(
            {"_id": ObjectId(resume_id)},
            {
                "$set": {
                    "embedding": vector,
                    "embeddingMeta": {
                        "filename": filename,
                        "name": name,
                        "skills": skills,
                    },
                }
            },
        )
        logger.info("Vector stored in MongoDB for resume_id=%s", resume_id)
        return True
    except Exception as exc:
        logger.error("Failed to store vector in MongoDB: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Vector Search (MongoDB Atlas $vectorSearch)
# ---------------------------------------------------------------------------
async def vector_search(
    query_vector: list[float],
    top_k: int = 5,
) -> list[dict]:
    """
    Perform semantic search using MongoDB Atlas Vector Search.

    Requires a vector search index named 'vector_index' on the 'resumes'
    collection with the 'embedding' field.

    Args:
        query_vector: Query embedding vector (768-dim).
        top_k: Number of results to return.

    Returns:
        List of match dicts with resume_id, score, and metadata.
    """
    pipeline = [
        {
            "$vectorSearch": {
                "index": "vector_index",
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": top_k * 10,
                "limit": top_k,
            }
        },
        {
            "$project": {
                "_id": 1,
                "filename": 1,
                "candidateName": 1,
                "parsedData.skills": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        },
    ]

    try:
        results = await resumes_collection.aggregate(pipeline).to_list(length=top_k)
        matches = []
        for doc in results:
            matches.append({
                "resume_id": str(doc["_id"]),
                "score": doc.get("score", 0.0),
                "metadata": {
                    "filename": doc.get("filename", ""),
                    "name": doc.get("candidateName", ""),
                    "skills": (
                        doc.get("parsedData", {}).get("skills", [])
                        if doc.get("parsedData")
                        else []
                    ),
                },
            })
        return matches
    except Exception as exc:
        logger.error("MongoDB vector search failed: %s", exc)
        raise


def vector_search_ready() -> bool:
    """Check if vector search infrastructure is available."""
    return resumes_collection is not None
