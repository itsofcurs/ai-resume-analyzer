import asyncio
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

# Ensure ai-service is in PYTHONPATH
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import get_mongo_collection
from workflows.fraud_detection_workflow import FraudDetectionWorkflow


async def run_e2e_test():
    print("=== Starting E2E Fraud Detection Test ===")

    collection = get_mongo_collection()

    # Create a mock resume document
    print("Creating mock candidate...")
    mock_resume = {
        "candidateName": "John Doe (Fraud Test)",
        "status": "EVALUATED",
        "parsedData": {
            "skills": ["Python", "React", "Node.js", "MongoDB", "AWS"],
            "experience": [
                {
                    "title": "Senior Staff Engineer",
                    "company": "Google",
                    "duration": "2015 - Present",
                    "description": "Led the entire AI division.",
                }
            ],
            "education": [{"degree": "Ph.D. in Computer Science", "school": "MIT"}],
        },
        "interviewQuestions": [
            {
                "question": "Tell me about your time leading the AI division at Google.",
                "candidateAnswer": "I haven't really worked there, to be honest. I just wrote that to get the interview. I mostly did some side projects in React.",
            },
            {
                "question": "Can you elaborate on your Ph.D. research at MIT?",
                "candidateAnswer": "I didn't go to MIT. I went to a local community college.",
            },
        ],
        "interviewEvaluation": {
            "overallScore": 30,
            "technicalScore": 20,
            "communicationScore": 60,
            "culturalFitScore": 40,
            "feedback": "Candidate admitted to fabricating significant portions of their resume including employment history and education.",
        },
    }

    result = await collection.insert_one(mock_resume)
    resume_id = str(result.inserted_id)
    print(f"Mock candidate created with ID: {resume_id}")

    # Run the workflow
    print("Executing Fraud Detection Workflow...")
    workflow = FraudDetectionWorkflow()
    final_state = await workflow.run(resume_id)

    if final_state.get("error"):
        print(f"Workflow Failed with error: {final_state['error']}")
        return

    print("\n=== Workflow Completed Successfully ===")
    print("Final Analysis Result:")
    print(json.dumps(final_state.get("analysis_result", {}), indent=2))

    # Verify in DB
    print("\nVerifying database update...")
    updated_doc = await collection.find_one({"_id": result.inserted_id})
    fraud_data = updated_doc.get("fraudAnalysis")

    if fraud_data:
        print("Database verification PASSED!")
        print(f"Fraud Risk: {fraud_data.get('fraudRisk')}")
        print(f"Trust Score: {fraud_data.get('trustScore')}")
        print(f"Recruiter Decision: {fraud_data.get('recruiterDecision')}")
    else:
        print("Database verification FAILED! fraudAnalysis not found in document.")

    # Cleanup
    print("\nCleaning up mock data...")
    await collection.delete_one({"_id": result.inserted_id})
    print("Cleanup complete.")


if __name__ == "__main__":
    asyncio.run(run_e2e_test())
