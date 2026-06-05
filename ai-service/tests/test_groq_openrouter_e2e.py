"""
tests/test_groq_openrouter_e2e.py
---------------------------------
Automated E2E test verifying Groq/OpenRouter multi-LLM layer routing.
"""

import sys
import os

os.environ["GROQ_API_KEY"] = "gsk_mock_groq_key"
os.environ["OPENROUTER_API_KEY"] = "sk-or-mock_openrouter_key"
os.environ["GEMINI_API_KEY"] = "mock_gemini_key"

# Add ai-service to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.llm.llm_router import LLMRouter
from langchain_core.runnables import Runnable

def test_routing():
    tasks = [
        "ats_scoring",
        "candidate_ranking",
        "interview_generation",
        "resume_parsing",
        "copilot",
        "comparison",
        "recommendation",
    ]
    
    print("=======================================")
    print("Groq & OpenRouter Multi-LLM Test")
    print("=======================================")
    
    success = True
    for task in tasks:
        try:
            llm = LLMRouter.get_llm(task)
            assert isinstance(llm, Runnable), f"Expected Runnable for task {task}"
            print(f"[OK] Task '{task}' successfully routed and configured.")
        except Exception as e:
            print(f"[FAIL] Task '{task}' failed routing: {e}")
            success = False
            
    if success:
        print("\nAll routing rules successfully configured!")
        return
    else:
        print("\nSome routing rules failed.")
        sys.exit(1)

if __name__ == "__main__":
    test_routing()
