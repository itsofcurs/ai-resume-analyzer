import asyncio
import json
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
)

from database import get_mongo_collection
from workflows.skill_graph_workflow import SkillGraphWorkflow


async def run_e2e_skill_graph():
    print("==================================================")
    print("PHASE 3B: E2E SKILL GRAPH INTELLIGENCE TEST")
    print("==================================================")

    collection = get_mongo_collection()

    # 1. Create a mock candidate
    mock_resume = {
        "candidateName": "Elena Rust",
        "organizationId": "org_default_123",
        "parsedData": {
            "skills": ["Python", "React", "Node.js", "Project Management", "Leadership"]
        },
        "atsScores": {"overall_score": 85},
        "interviewEvaluation": {
            "evaluation": "Excellent communication. Demonstrated strong architectural thinking.",
            "overall_score": 90,
            "technical_score": 95,
            "behavioral_score": 85,
        },
        "answerAuthenticity": {"authenticityScore": 92},
        "skillGraph": None,
    }

    result = await collection.insert_one(mock_resume)
    resume_id = str(result.inserted_id)

    print(f"\n[INFO] Created mock candidate with ID: {resume_id}")
    print("[INFO] Invoking Skill Graph Workflow...")

    # 2. Run Workflow
    workflow = SkillGraphWorkflow()
    prediction = await workflow.run(resume_id)

    # 3. Validate
    print("\n--- SKILL GRAPH RESULTS ---")
    print(json.dumps(prediction, indent=2))

    if "error" in prediction:
        print("\n❌ E2E TEST FAILED: Workflow returned an error")
    elif "technicalSkills" in prediction and "softSkills" in prediction:
        print("\n✅ E2E TEST PASSED: Technical and Soft skills generated successfully.")
    else:
        print("\n❌ E2E TEST FAILED: Missing required fields in Skill Graph")

    print("\n[INFO] Cleaning up test data...")
    await collection.delete_one({"_id": result.inserted_id})
    print("[INFO] Cleanup complete.\n")


if __name__ == "__main__":
    asyncio.run(run_e2e_skill_graph())
