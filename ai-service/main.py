import logging
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from bson import ObjectId
import json
import time

from database import get_mongo_collection, get_chroma_collection
from nlp_pipeline import download_and_extract_text, analyze_resume_unified
from embeddings import generate_embedding

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Recruitment Intelligence Service")

class ProcessRequest(BaseModel):
    resume_id: str
    cloudinary_url: str
    filename: str

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5

async def process_resume_pipeline(resume_id: str, cloudinary_url: str, filename: str):
    logger.info(f"Starting pipeline for Resume ID: {resume_id}")
    collection = get_mongo_collection()
    
    start_total = time.time()
    try:
        # 1. Download and Extract Text
        start_step = time.time()
        raw_text = download_and_extract_text(cloudinary_url, filename)
        logger.info(f"[PERF] 1. Download & Text Extraction completed in {time.time() - start_step:.2f}s")
        if not raw_text:
            raise Exception("Failed to extract text from document")
            
        # 2. Update Status to EXTRACTING
        start_step = time.time()
        await collection.update_one(
            {"_id": ObjectId(resume_id)},
            {"$set": {"status": "EXTRACTING", "rawText": raw_text}}
        )
        logger.info(f"[PERF] 2. MongoDB set to EXTRACTING completed in {time.time() - start_step:.2f}s")
        
        # 3. High-Accuracy Unified Gemini Analysis
        start_step = time.time()
        unified_data = analyze_resume_unified(raw_text)
        logger.info(f"[PERF] 3. Gemini 2.5 Unified Analysis completed in {time.time() - start_step:.2f}s")
        parsed_data = {
            "name": unified_data.get("name", "Unknown Candidate"),
            "email": unified_data.get("email", ""),
            "phone": unified_data.get("phone", ""),
            "skills": unified_data.get("skills", [])
        }
        authenticity_data = {
            "authenticity_score": unified_data.get("authenticity_score", 90),
            "ai_generated_probability": unified_data.get("ai_generated_probability", 10),
            "red_flags": unified_data.get("red_flags", []),
            "technical_depth_score": unified_data.get("technical_depth_score", 80)
        }
        
        # 4. Generate Embeddings for Semantic Search
        start_step = time.time()
        logger.info(f"Generating embeddings for Resume ID: {resume_id}")
        vector = generate_embedding(raw_text)
        logger.info(f"[PERF] 4. SentenceTransformer Embeddings generation completed in {time.time() - start_step:.2f}s")
        
        # 5. Store in ChromaDB
        start_step = time.time()
        chroma = get_chroma_collection()
        if chroma is not None:
            chroma.add(
                ids=[resume_id],
                embeddings=[vector],
                metadatas=[{
                    "filename": filename,
                    "name": parsed_data.get("name", ""),
                    "skills": json.dumps(parsed_data.get("skills", []))
                }]
            )
        logger.info(f"[PERF] 5. ChromaDB vector storage completed in {time.time() - start_step:.2f}s")
        
        # 6. Final Update to PROCESSED
        start_step = time.time()
        await collection.update_one(
            {"_id": ObjectId(resume_id)},
            {
                "$set": {
                    "status": "PROCESSED",
                    "parsedData": parsed_data,
                    "aiAnalysis": authenticity_data,
                    "candidateName": parsed_data.get("name"),
                    "candidateEmail": parsed_data.get("email"),
                    "candidatePhone": parsed_data.get("phone"),
                    "embeddingsId": resume_id
                }
            }
        )
        logger.info(f"[PERF] 6. Final MongoDB status update to PROCESSED completed in {time.time() - start_step:.2f}s")
        logger.info(f"[PERF] Total resume processing time: {time.time() - start_total:.2f}s")
        logger.info(f"Successfully processed Resume ID: {resume_id}")
        
    except Exception as e:
        logger.error(f"Pipeline failed for {resume_id}: {e}")
        await collection.update_one(
            {"_id": ObjectId(resume_id)},
            {"$set": {"status": "FAILED"}}
        )

@app.post("/api/process")
async def process_resume(req: ProcessRequest, background_tasks: BackgroundTasks):
    """
    Webhook endpoint called by Node.js backend after Cloudinary upload.
    Spawns background task to run NLP and Embeddings pipeline.
    """
    if not req.resume_id or not req.cloudinary_url:
        raise HTTPException(status_code=400, detail="Missing required fields")
        
    background_tasks.add_task(process_resume_pipeline, req.resume_id, req.cloudinary_url, req.filename)
    return {"message": "AI Processing Pipeline Started"}

@app.post("/api/search")
def semantic_search(req: SearchRequest):
    """
    Takes a natural language query from recruiter, generates embedding, and finds top K resumes.
    """
    chroma = get_chroma_collection()
    if chroma is None:
        raise HTTPException(status_code=500, detail="Vector DB not initialized")
        
    try:
        query_vector = generate_embedding(req.query)
        results = chroma.query(
            query_embeddings=[query_vector],
            n_results=req.top_k
        )
        
        # Format the response
        matches = []
        if results and "ids" in results and results["ids"]:
            for i in range(len(results["ids"][0])):
                matches.append({
                    "resume_id": results["ids"][0][i],
                    "distance": results["distances"][0][i] if "distances" in results else 0.0,
                    "metadata": results["metadatas"][0][i] if "metadatas" in results else {}
                })
                
        return {"query": req.query, "matches": matches}
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail="Semantic search failed")

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "AI Recruitment Intelligence"}
