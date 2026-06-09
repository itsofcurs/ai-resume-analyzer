import asyncio
import sys
import os
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from workflows.adaptive_interview_workflow import AdaptiveInterviewWorkflow

async def test_adaptive_interview():
    print("[+] Initializing Adaptive Interview Workflow...")
    workflow = AdaptiveInterviewWorkflow()
    
    topic = "React Performance Optimization"
    history = [
        {
            "question": "How do you handle state in React?",
            "answer": "I use Redux or Context API. I also use local state with useState."
        }
    ]
    
    print(f"\n[+] Testing Round 1 - Topic: {topic}")
    print(f"History: {json.dumps(history, indent=2)}")
    
    result = await workflow.run(
        current_topic=topic,
        conversation_history=history,
        resume_id="test_resume",
        organization_id="org_test"
    )
    
    print("\n[+] Round 1 Results:")
    print(f"Evaluation: {result.get('evaluation')}")
    print(f"Direction: {result.get('direction')}")
    print(f"Next Question: {result.get('next_question')}")
    
    # Simulate Round 2 where candidate gives a very poor answer
    print("\n[+] Testing Round 2 (Simulating a poor answer to drill down)")
    history.append({
        "question": result.get('next_question'),
        "answer": "I don't really know, maybe just use useEffect?"
    })
    
    result2 = await workflow.run(
        current_topic=topic,
        conversation_history=history,
        resume_id="test_resume",
        organization_id="org_test"
    )
    
    print("\n[+] Round 2 Results:")
    print(f"Evaluation: {result2.get('evaluation')}")
    print(f"Direction: {result2.get('direction')}")
    print(f"Next Question: {result2.get('next_question')}")

if __name__ == "__main__":
    asyncio.run(test_adaptive_interview())
