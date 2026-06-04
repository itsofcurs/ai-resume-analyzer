import asyncio
import os
import sys
from dotenv import load_dotenv

# Load env before importing database
load_dotenv(os.path.join(os.path.dirname(__file__), "ai-service", ".env"))

# Add ai-service to path so we can import workflows
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ai-service")))

from database import get_mongo_collection
from workflows.interview_workflow import InterviewQuestionGraph

async def main():
    print("Starting e2e test for InterviewQuestionGraph...")
    
    # 1. Find a PROCESSED resume in MongoDB
    collection = get_mongo_collection()
    resume = await collection.find_one({"status": "PROCESSED"})
    if not resume:
        print("No PROCESSED resume found in MongoDB. Cannot run e2e test.")
        return
        
    resume_id = str(resume["_id"])
    print(f"Found processed resume: {resume_id} - {resume.get('candidateName', 'Unknown')}")
    
    # 2. Run the graph
    print("Running InterviewQuestionGraph...")
    graph = InterviewQuestionGraph()
    await graph.run(resume_id)
    print("Graph execution finished.")
    
    # 3. Verify it's in MongoDB
    updated_resume = await collection.find_one({"_id": resume["_id"]})
    questions = updated_resume.get("interviewQuestions")
    
    if not questions:
        print("❌ FAILED: interviewQuestions not found in MongoDB after execution.")
        sys.exit(1)
        
    print("\n✅ SUCCESS: Questions found in MongoDB!")
    print(f"- Technical Questions: {len(questions.get('technicalQuestions', []))}")
    print(f"- Project Questions: {len(questions.get('projectQuestions', []))}")
    print(f"- Behavioral Questions: {len(questions.get('behavioralQuestions', []))}")
    print(f"- Follow-up Questions: {len(questions.get('followUpQuestions', []))}")
    
    print("\nSample Technical Question:")
    if questions.get('technicalQuestions'):
        print(questions['technicalQuestions'][0])

if __name__ == "__main__":
    asyncio.run(main())
