import asyncio
from workflows.copilot_workflow import CopilotWorkflow

async def main():
    print("Testing Copilot...")
    workflow = CopilotWorkflow()
    res = await workflow.run("Find me developers that know React")
    print(res)

if __name__ == "__main__":
    asyncio.run(main())
