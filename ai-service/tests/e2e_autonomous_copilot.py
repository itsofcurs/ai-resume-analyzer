import asyncio
import os
from pprint import pprint
import pytest
from workflows.autonomous_copilot_workflow import AutonomousCopilotWorkflow
from database import get_mongo_collection

# To run: pytest -v e2e_autonomous_copilot.py

@pytest.mark.asyncio
async def test_autonomous_copilot_e2e():
    """
    E2E test for the Autonomous Recruiter Copilot Workflow.
    Requires MongoDB to be running and populated with at least one resume.
    """
    if not os.getenv("MONGODB_URI"):
        pytest.skip("Skipping because MONGODB_URI is not set")
        
    query = "Find our strongest candidate with low fraud risk and good leadership potential."
    print(f"\n--- Testing Autonomous Copilot on Query: '{query}' ---")
    
    workflow = AutonomousCopilotWorkflow()
    result = await workflow.run(query)
    
    assert "error" not in result or result["error"] is None
    
    print("\n[E2E] Output of Autonomous Copilot:")
    pprint(result)
    
    assert "plan" in result, "Missing execution plan"
    assert "results" in result, "Missing tool results"
    assert "best_candidate" in result, "Missing best_candidate recommendation"
    assert "risks" in result, "Missing risks"
    assert "strengths" in result, "Missing strengths"
    assert "suggested_next_action" in result, "Missing suggested_next_action"
    
    print("\n[E2E] Autonomous Copilot passed basic validation.")

if __name__ == "__main__":
    asyncio.run(test_autonomous_copilot_e2e())
