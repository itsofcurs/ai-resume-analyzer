import asyncio
import os
from pprint import pprint
import pytest
from workflows.success_prediction_workflow import SuccessPredictionWorkflow
from database import get_mongo_collection

# To run: pytest -v e2e_success_prediction.py

@pytest.mark.asyncio
async def test_success_prediction_e2e():
    """
    E2E test for the Success Prediction Agent.
    Requires MongoDB to be running and populated with at least one resume.
    """
    if not os.getenv("MONGODB_URI"):
        pytest.skip("Skipping because MONGODB_URI is not set")
        
    collection = get_mongo_collection()
    
    # Find a resume that preferably has some parsed data and ats scores
    sample_resume = await collection.find_one({"status": "PROCESSED"})
    if not sample_resume:
        pytest.skip("No processed resume found in the database. Run previous pipeline steps first.")
        
    resume_id = str(sample_resume["_id"])
    print(f"\n--- Testing Success Prediction on Resume ID: {resume_id} ---")
    
    workflow = SuccessPredictionWorkflow()
    result = await workflow.run(resume_id)
    
    assert "error" not in result or result["error"] is None
    
    sp = result
    
    assert "culturalFit" in sp, "Missing culturalFit in prediction"
    assert "predictedAt" in sp, "Missing predictedAt in prediction"
    assert "developmentAreas" in sp, "Missing developmentAreas in prediction"
    
    print("\n[E2E] Output of Success Prediction Agent:")
    pprint(sp)
    
    # Verify strict safety compliance (No protected characteristics)
    summary_lower = sp.get("executiveSummary", "").lower()
    protected_words = ["race", "gender", "age", "religion", "sexuality", "nationality", "disability", "marital"]
    
    for word in protected_words:
        assert word not in summary_lower, f"Safety Violation: found protected characteristic '{word}' in prediction"
        
    print("\n[E2E] Success Prediction passed all basic validation and safety checks.")

if __name__ == "__main__":
    asyncio.run(test_success_prediction_e2e())
