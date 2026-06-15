import json

from sentence_transformers import SentenceTransformer

from .db import vector_collection

# Load a pre-trained sentence transformer model
# all-MiniLM-L6-v2 is fast and effective for semantic matching
embedder = SentenceTransformer("all-MiniLM-L6-v2")


def index_resume(resume_id: int, parsed_data: dict, raw_text: str):
    """
    Embed resume content and store in ChromaDB for semantic search.
    """
    # Create a dense representation of the candidate's skills and experience
    skills = " ".join([s["skill"] for s in parsed_data.get("skills", [])])
    experience = " ".join(
        [
            e.get("role", "") + " at " + e.get("company", "")
            for e in parsed_data.get("experience", [])
        ]
    )

    document = f"Skills: {skills}. Experience: {experience}. Summary: {parsed_data.get('summary', '')}"

    # Generate embedding
    embedding = embedder.encode(document).tolist()

    # Store in ChromaDB
    vector_collection.add(
        embeddings=[embedding],
        documents=[document],
        metadatas=[{"resume_id": resume_id, "parsed_data": json.dumps(parsed_data)}],
        ids=[f"resume_{resume_id}"],
    )


def semantic_search(query: str, n_results: int = 5):
    """
    Search for resumes matching a query (e.g. Job Description).
    """
    query_embedding = embedder.encode(query).tolist()

    results = vector_collection.query(
        query_embeddings=[query_embedding], n_results=n_results
    )

    matches = []
    if results["ids"] and len(results["ids"]) > 0:
        for i in range(len(results["ids"][0])):
            matches.append(
                {
                    "id": results["ids"][0][i],
                    "score": results["distances"][0][i],
                    "document": results["documents"][0][i],
                    "metadata": results["metadatas"][0][i],
                }
            )

    return matches
