import os
import json
import uuid
import time
import logging
from typing import Dict, Any, List
import redis

# Use the centralized database tools
from database import get_mongo_collection, get_chroma_client
from embeddings import generate_embedding

logger = logging.getLogger(__name__)

class RecruiterMemory:
    """
    Hybrid memory model for Agent Context:
    1. Short-Term Memory -> Redis
    2. Long-Term Memory -> ChromaDB (Semantic) + MongoDB (Metadata)
    """
    def __init__(self):
        self.redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://127.0.0.1:6379"), decode_responses=True)
        self.chroma = get_chroma_client()
        self.collection_name = "recruiter_memory"
        
        # Ensure Chroma collection exists
        try:
            self.chroma_collection = self.chroma.get_or_create_collection(name=self.collection_name)
        except Exception as e:
            logger.error(f"Failed to initialize Chroma collection {self.collection_name}: {e}")
            self.chroma_collection = None
            
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
            self.redis_client.lpush(redis_key, json.dumps(doc))
            self.redis_client.ltrim(redis_key, 0, 49) # Keep last 50
            self.redis_client.expire(redis_key, 86400)
            
        # 2. Long-Term Memory Metadata (MongoDB)
        try:
            mongo_coll = get_mongo_collection("agent_memories")
            mongo_coll.insert_one(doc.copy())
        except Exception as e:
            logger.error(f"MongoDB memory storage failed: {e}")
            
        # 3. Long-Term Semantic Memory (ChromaDB)
        if self.chroma_collection and content:
            try:
                embedding = generate_embedding(content)
                self.chroma_collection.add(
                    documents=[content],
                    embeddings=[embedding],
                    metadatas=[{
                        "organization_id": organization_id,
                        "recruiter_id": str(recruiter_id),
                        "candidate_id": str(candidate_id),
                        "type": memory_type,
                        "memory_id": memory_id
                    }],
                    ids=[memory_id]
                )
            except Exception as e:
                logger.error(f"ChromaDB memory storage failed: {e}")
                
        return memory_id
        
    async def get_candidate_memory(self, organization_id: str, candidate_id: str) -> List[Dict[str, Any]]:
        """Retrieves long term interaction history for a candidate"""
        try:
            mongo_coll = get_mongo_collection("agent_memories")
            cursor = mongo_coll.find({
                "organization_id": organization_id,
                "candidate_id": candidate_id
            }).sort("timestamp", -1).limit(20)
            
            results = []
            for doc in cursor:
                doc['_id'] = str(doc['_id'])
                results.append(doc)
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
        """Semantic search across organizational memory"""
        if not self.chroma_collection:
            return []
            
        try:
            embedding = generate_embedding(query)
            results = self.chroma_collection.query(
                query_embeddings=[embedding],
                n_results=limit,
                where={"organization_id": organization_id}
            )
            
            memories = []
            for i in range(len(results['ids'][0])):
                memories.append({
                    "id": results['ids'][0][i],
                    "content": results['documents'][0][i],
                    "metadata": results['metadatas'][0][i],
                    "distance": results['distances'][0][i] if 'distances' in results and results['distances'] else 0
                })
            return memories
        except Exception as e:
            logger.error(f"ChromaDB search failed: {e}")
            return []
