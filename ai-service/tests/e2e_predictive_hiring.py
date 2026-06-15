import asyncio
import sys

from database import get_mongo_collection
from workflows.predictive_hiring_workflow import PredictiveHiringWorkflow


async def run_e2e():
    print("=== Predictive Hiring E2E Test ===")

    # 1. Fetch a mock processed resume or the most recent one
    collection = get_mongo_collection()
    resume = await collection.find_one(
        {
            "status": "PROCESSED",
            "fraudAnalysis": {"$exists": True},
            "skillGapAnalysis": {"$exists": True},
        }
    )

    if not resume:
        print(
            "❌ No suitable resume found in DB for testing. Please upload a resume first."
        )
        return

    resume_id = str(resume["_id"])
    print(f"Testing with Resume ID: {resume_id}")
    print(f"Candidate: {resume.get('candidateName', 'Unknown')}")

    # 2. Run Predictive Hiring Workflow
    print("\nRunning PredictiveHiringWorkflow...")
    workflow = PredictiveHiringWorkflow()
    result = await workflow.run(resume_id)

    if "error" in result:
        print(f"❌ Workflow failed: {result['error']}")
        sys.exit(1)

    print("\n✅ Workflow completed successfully!")
    print(f"Success Score: {result.get('successScore')}")
    print(f"Retention Risk: {result.get('retentionRisk')}")
    print(f"Leadership Potential: {result.get('leadershipPotential')}")
    print(f"Team Fit Score: {result.get('teamFitScore')}")
    print(f"Hiring Decision: {result.get('hiringDecision')}")
    print(f"Confidence: {result.get('hiringConfidence')}")
    print(f"Explanation: {result.get('explanation')}")

    # 3. Verify Persistence
    updated_resume = await collection.find_one({"_id": resume["_id"]})
    if "predictiveHiring" in updated_resume:
        print("\n✅ Results successfully persisted to MongoDB.")
    else:
        print("\n❌ Results NOT found in MongoDB.")
        sys.exit(1)


if __name__ == "__main__":
    from core.config import get_settings

    settings = get_settings()

    # Required to avoid event loop issues with pytest/asyncio in some setups
    asyncio.run(run_e2e())
