import asyncio
import json
import logging

from bson import ObjectId
from database import get_mongo_collection

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


async def test_skill_gap_workflow():
    collection = get_mongo_collection()

    # Insert a dummy resume with some required fields
    dummy_resume = {
        "_id": ObjectId(),
        "candidateName": "Skill Gap Test Candidate",
        "parsedData": {
            "skills": ["Python", "Machine Learning"],
            "experience": ["2 years as Data Scientist"],
        },
        "interviewEvaluation": {
            "overall_score": 75,
            "strengths": ["Strong Python skills"],
            "weaknesses": ["Needs improvement in Docker"],
            "qa_pairs": [
                {
                    "question": "How do you deploy ML models?",
                    "answer": "I have not deployed them yet, only trained them.",
                    "score": 4,
                    "feedback": "Lacks deployment experience.",
                }
            ],
        },
        "fraudAnalysis": {
            "fraudRisk": "LOW",
            "trustScore": 95,
            "consistencyScore": 90,
            "suspiciousClaims": [],
            "verifiedClaims": [
                {
                    "claim": "2 years as Data Scientist",
                    "evidence": "Confirmed via ML questions",
                    "confidence": 95,
                }
            ],
            "hiringImpact": "Positive",
            "recruiterDecision": "Proceed",
        },
    }

    resume_id = str(dummy_resume["_id"])
    logger.info(f"Inserting dummy candidate with ID: {resume_id}")
    await collection.insert_one(dummy_resume)

    # Initialize the Skill Gap Workflow directly to bypass the webhook trigger
    from workflows.skill_gap_workflow import SkillGapWorkflow

    workflow = SkillGapWorkflow()

    logger.info("Running Skill Gap Workflow...")
    result = await workflow.run(resume_id)

    logger.info("Workflow execution complete.")
    if "error" in result:
        logger.error(f"Error during execution: {result['error']}")
    else:
        logger.info(f"Result:\n{json.dumps(result, indent=2)}")

    # Verify the database was updated
    updated_resume = await collection.find_one({"_id": ObjectId(resume_id)})
    if updated_resume and "skillGapAnalysis" in updated_resume:
        logger.info("Successfully persisted skillGapAnalysis to MongoDB!")

        sg = updated_resume["skillGapAnalysis"]
        logger.info("--- Data Check ---")
        logger.info(f"Hiring Readiness: {sg.get('hiringReadinessScore')}")
        logger.info(f"Growth Potential: {sg.get('growthPotentialScore')}")
        logger.info(f"Learning Agility: {sg.get('learningAgilityScore')}")
        logger.info(f"Strengths Count: {len(sg.get('strengths', []))}")
        logger.info(f"Weaknesses Count: {len(sg.get('weaknesses', []))}")
        logger.info(f"Missing Skills Count: {len(sg.get('missingSkills', []))}")
        logger.info(f"30 Day Plan Count: {len(sg.get('thirtyDayPlan', []))}")
        logger.info("------------------")
    else:
        logger.error("skillGapAnalysis NOT found in database!")

    # Cleanup
    await collection.delete_one({"_id": ObjectId(resume_id)})
    logger.info(f"Cleaned up dummy candidate {resume_id}")


if __name__ == "__main__":
    asyncio.run(test_skill_gap_workflow())
