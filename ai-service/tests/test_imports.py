"""
ai-service/tests/test_imports.py
--------------------------------
Validates that all critical third-party dependencies required for
the Multi-LLM, Vector Search, and Document processing are available.
"""

import sys
import logging

def test_critical_imports():
    """
    Test that the critical dependencies can be imported.
    """
    missing = []
    
    # 1. MongoDB and BSON
    try:
        import pymongo
        import motor.motor_asyncio
        import bson
    except ImportError as e:
        missing.append(f"MongoDB Drivers (pymongo/motor/bson): {e}")

    # 2. Redis
    try:
        import redis
    except ImportError as e:
        missing.append(f"Redis: {e}")

    # 3. ChromaDB
    try:
        import chromadb
    except ImportError as e:
        missing.append(f"ChromaDB: {e}")

    # 4. LangGraph and LangChain
    try:
        import langgraph
        import langchain
        import langchain_core
        import langchain_google_genai
        import langchain_openai
        import langchain_groq
    except ImportError as e:
        missing.append(f"LangChain/LangGraph Ecosystem: {e}")
        
    assert not missing, "Missing critical dependencies:\n" + "\n".join(missing)
    print("All critical dependencies imported successfully.")

if __name__ == "__main__":
    test_critical_imports()
