import asyncio
import os
import sys

sys.path.append(os.path.abspath('ai-service'))
from ai_service.workflows.success_prediction_workflow import SuccessPredictionWorkflow

async def main():
    wf = SuccessPredictionWorkflow()
    # Mock resume_id that is a valid Mongo ObjectId
    res = await wf.run("65a0b73e5f2c4a9d8134bbbb")
    print(res)

if __name__ == "__main__":
    asyncio.run(main())
