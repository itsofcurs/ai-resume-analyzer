import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from workflows.authenticity_workflow import AuthenticityWorkflow


async def test_authenticity():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["talentai"]
    collection = db["resumes"]

    # Create a mock resume for testing
    mock_resume = {
        "candidateName": "Test Plagiarizer",
        "organizationId": "org-test-123",
        "parsedData": {"skills": ["Python", "React", "Node"]},
        "interviewEvaluation": {
            "answers": [
                {
                    "question": "What is Node.js?",
                    "answer": "Node.js is a cross-platform, open-source JavaScript runtime environment that can run on Windows, Linux, Unix, macOS, and more.",
                },
                {
                    "question": "How do you handle state in React?",
                    "answer": "I use Redux and Context API. React is a free and open-source front-end JavaScript library for building user interfaces based on components.",
                },
            ]
        },
    }

    result = await collection.insert_one(mock_resume)
    resume_id = str(result.inserted_id)
    print(f"[+] Created mock resume with ID: {resume_id}")

    print("[+] Running AuthenticityWorkflow...")
    workflow = AuthenticityWorkflow()
    final_state = await workflow.run(resume_id)

    print("\n[+] Final State Output:")
    if final_state:
        auth = final_state
        print(f"Authenticity Score: {auth.get('authenticityScore')}")
        print(f"AI Probability: {auth.get('aiGeneratedProbability')}")
        print(f"Similarity: {auth.get('plagiarismSimilarity')}")
        print(f"Consistency: {auth.get('behavioralConsistency')}")
        print(f"Copy-Paste Risk: {auth.get('copyPasteRisk')}")
        print(f"Alert: {auth.get('recruiterAlert')}")
        print(f"Assessment: {auth.get('finalAssessment')}")
    else:
        print("Error: No answerAuthenticity found in final state!")
        print(final_state.get("error", "Unknown Error"))

    # Cleanup
    await collection.delete_one({"_id": result.inserted_id})
    print("[+] Cleaned up mock resume.")
    client.close()


if __name__ == "__main__":
    asyncio.run(test_authenticity())
