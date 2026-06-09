import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath('ai-service'))
os.environ["PYTHONPATH"] = os.path.abspath('ai-service')

# Need to load env vars so DB connects
from dotenv import load_dotenv
load_dotenv(os.path.abspath('ai-service/.env'))

from workflows.success_prediction_workflow import SuccessPredictionWorkflow

async def main():
    try:
        wf = SuccessPredictionWorkflow()
        # Create a mock MongoDB connection or let it fail
        # Actually it's probably better to just mock the state 
        state = {
            "resume_id": "65a0b73e5f2c4a9d8134bbbb",
            "resume_data": None,
            "ats_scores": None,
            "interview_evaluation": None,
            "fraud_analysis": None,
            "skill_gap_analysis": None,
            "behavioral_signals": None,
            "learning_agility": None,
            "adaptability_score": None,
            "communication_potential": None,
            "retention_risk": None,
            "leadership_potential": None,
            "success_probability": None,
            "growth_trajectory": None,
            "recommended_career_path": None,
            "strengths": None,
            "development_areas": None,
            "cultural_fit": None,
            "executive_summary": None,
            "success_prediction": None,
            "error": None,
            # Let's set skill_graph to None
            "skill_graph": None,
            "voice_video_analysis": None
        }
        res = await wf._node_generate(state)
        print("GENERATE RESULT:", res)
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
