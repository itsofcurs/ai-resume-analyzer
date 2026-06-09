import asyncio
import os
import sys
import json
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workflows.knowledge_graph_workflow import KnowledgeGraphWorkflow
from core.config import settings

async def run_e2e():
    print("🚀 Starting Knowledge Graph E2E Test...")
    
    # Connect to Mongo
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB_NAME]
    collection = db["resumes"]
    
    # 1. Check if we have candidates
    count = await collection.count_documents({})
    if count == 0:
        print("❌ No resumes found in database. Please run Phase 3B tests first.")
        return
        
    print(f"✅ Found {count} resumes in database.")
    
    # Get a test candidate
    candidate = await collection.find_one({})
    resume_id = str(candidate["_id"])
    org_id = candidate.get("organizationId", "test-org")
    
    # Set org_id if missing to pass tests
    if "organizationId" not in candidate:
        await collection.update_one({"_id": ObjectId(resume_id)}, {"$set": {"organizationId": org_id}})
    
    print(f"Testing with candidate: {candidate.get('candidateName', 'Unknown')} ({resume_id}) in Org: {org_id}")
    
    # 2. Run the workflow
    workflow = KnowledgeGraphWorkflow()
    print("⚙️ Running Knowledge Graph generation (this triggers the LLM)...")
    
    result = await workflow.run(resume_id, org_id)
    
    if "error" in result and result["error"]:
        print(f"❌ Workflow failed: {result['error']}")
        return
        
    print("✅ Workflow completed successfully.")
    
    # 3. Verify DB update
    updated = await collection.find_one({"_id": ObjectId(resume_id)})
    kg = updated.get("knowledgeGraph")
    
    if not kg:
        print("❌ No knowledgeGraph field found in updated document!")
        return
        
    print("✅ Verified knowledgeGraph exists in DB:")
    print(f"  - Cluster: {kg.get('candidateCluster')}")
    print(f"  - Graph Score: {kg.get('graphScore')}")
    print(f"  - Connected Skills: {len(kg.get('connectedSkills', []))}")
    print(f"  - Hidden Talents: {kg.get('hiddenTalents', [])}")
    print(f"  - Similar Candidates Found: {len(kg.get('similarCandidates', []))}")
    
    print("\n🎉 E2E Test Passed Successfully!")

if __name__ == "__main__":
    asyncio.run(run_e2e())
