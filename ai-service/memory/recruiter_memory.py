import os
import json
import uuid
import time
import logging
from typing import Dict, Any, List
import redis

# Use the centralized database tools
from database import get_mongo_collection
from embeddings import generate_embedding

logger = logging.getLogger(__name__)

class RecruiterMemory:
    """
    Hybrid memory model for Agent Context:
    1. Short-Term Memory -> Redis
    2. Long-Term Memory -> MongoDB (Atlas Vector Search for Semantics)
    """
    def __init__(self):
        self.redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://127.0.0.1:6379"), decode_responses=True)
            
    async def store_memory(self, organization_id: str, payload: Dict[str, Any]) -> str:
        """Stores a memory snapshot into both short-term and long-term storage"""
        memory_id = str(uuid.uuid4())
        recruiter_id = payload.get("recruiterId")
        candidate_id = payload.get("candidateId")
        content = payload.get("content", "")
        memory_type = payload.get("type", "interaction")
        
        doc = {
            "memory_id": memory_id,
            "organization_id": organization_id,
            "recruiter_id": recruiter_id,
            "candidate_id": candidate_id,
            "type": memory_type,
            "content": content,
            "timestamp": time.time(),
            "metadata": payload.get("metadata", {})
        }
        
        # 1. Short-Term Memory (Redis) - TTL 24 hours
        if recruiter_id:
            redis_key = f"memory:org:{organization_id}:recruiter:{recruiter_id}"
            try:
                self.redis_client.lpush(redis_key, json.dumps(doc))
                self.redis_client.ltrim(redis_key, 0, 49) # Keep last 50
                self.redis_client.expire(redis_key, 86400)
            except Exception as e:
                logger.error(f"Redis memory storage failed: {e}")
            
        # 2. Long-Term Memory & Semantic (MongoDB)
        try:
            mongo_coll = get_mongo_collection("agent_memories")
            if content:
                # Generate embedding for vector search
                embedding = generate_embedding(content)
                # Note: The embedding function might be async depending on implementation, 
                # but if it was synchronous in the previous code, we keep it as is.
                doc["embedding"] = embedding
                
            mongo_coll.insert_one(doc)
        except Exception as e:
            logger.error(f"MongoDB memory storage failed: {e}")
                
        return memory_id
        
    async def get_candidate_memory(self, organization_id: str, candidate_id: str) -> List[Dict[str, Any]]:
        """Retrieves long term interaction history for a candidate"""
        try:
            mongo_coll = get_mongo_collection("agent_memories")
            # For async motor, we must use await to_list
            cursor = mongo_coll.find({
                "organization_id": organization_id,
                "candidate_id": candidate_id
            }).sort("timestamp", -1).limit(20)
            
            results = await cursor.to_list(length=20)
            for doc in results:
                doc['_id'] = str(doc['_id'])
                if "embedding" in doc:
                    del doc["embedding"] # Exclude large vector from results
            return results
        except Exception as e:
            logger.error(f"MongoDB candidate memory retrieval failed: {e}")
            return []

    async def get_recruiter_memory(self, organization_id: str, recruiter_id: str) -> List[Dict[str, Any]]:
        """Retrieves short-term context window for a recruiter"""
        redis_key = f"memory:org:{organization_id}:recruiter:{recruiter_id}"
        try:
            items = self.redis_client.lrange(redis_key, 0, 19)
            return [json.loads(i) for i in items]
        except Exception as e:
            logger.error(f"Redis recruiter memory retrieval failed: {e}")
            return []
            
    async def search_memory(self, organization_id: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Semantic search across organizational memory using MongoDB Vector Search"""
        try:
            embedding = generate_embedding(query)
            mongo_coll = get_mongo_collection("agent_memories")
            
            pipeline = [
                {
                    "$vectorSearch": {
                        "index": "memory_vector_index",
                        "path": "embedding",
                        "queryVector": embedding,
                        "numCandidates": limit * 10,
                        "limit": limit,
                        "filter": {"organization_id": organization_id}
                    }
                },
                {
                    "$project": {
                        "embedding": 0,
                        "score": {"$meta": "vectorSearchScore"}
                    }
                }
            ]
            
            results = await mongo_coll.aggregate(pipeline).to_list(length=limit)
            memories = []
            for doc in results:
                memories.append({
                    "id": doc.get("memory_id", str(doc["_id"])),
                    "content": doc.get("content", ""),
                    "metadata": {
                        "recruiter_id": doc.get("recruiter_id"),
                        "candidate_id": doc.get("candidate_id"),
                        "type": doc.get("type"),
                        "timestamp": doc.get("timestamp")
                    },
                    "distance": doc.get("score", 0)
                })
            return memories
        except Exception as e:
            logger.error(f"MongoDB vector search failed: {e}")
            return []
