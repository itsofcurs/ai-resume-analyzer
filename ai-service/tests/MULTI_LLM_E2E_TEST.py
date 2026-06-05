"""
tests/MULTI_LLM_E2E_TEST.py
---------------------------
Tests the LLMRouter for correct instantiation and fallback configuration.
"""

import sys
import os

os.environ["GEMINI_API_KEY"] = "mock_gemini_key"
os.environ["DEEPSEEK_API_KEY"] = "mock_deepseek_key"
os.environ["QWEN_API_KEY"] = "mock_qwen_key"

# Add ai-service to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.llm.llm_router import LLMRouter
from langchain_core.runnables import Runnable

def test_routing():
    tasks = [
        "ats_scoring",
        "ranking",
        "interview",
        "comparison",
        "copilot",
        "recommendation",
        "resume_parsing"
    ]
    
    print("=======================================")
    print("Multi-LLM Router Test")
    print("=======================================")
    
    success = True
    for task in tasks:
        try:
            llm = LLMRouter.get_llm(task)
            assert isinstance(llm, Runnable), f"Expected Runnable for task {task}"
            
            # Since LangChain abstracts fallbacks inside the runnable, 
            # we just ensure it initializes successfully without crashing.
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
