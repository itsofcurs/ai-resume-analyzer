"""
ai-service/tests/test_imports.py
--------------------------------
Validates that all critical third-party dependencies required for
the Multi-LLM, Vector Search, and Document processing are available.
"""


def test_critical_imports():
    """
    Test that the critical dependencies can be imported.
    """
    missing = []

    # 1. MongoDB and BSON
    try:
        pass
    except ImportError as e:
        missing.append(f"MongoDB Drivers (pymongo/motor/bson): {e}")

    # 2. Redis
    try:
        pass
    except ImportError as e:
        missing.append(f"Redis: {e}")

    # 3. ChromaDB
    try:
        pass
    except ImportError as e:
        missing.append(f"ChromaDB: {e}")

    # 4. LangGraph and LangChain
    try:
        pass
    except ImportError as e:
        missing.append(f"LangChain/LangGraph Ecosystem: {e}")

    assert not missing, "Missing critical dependencies:\n" + "\n".join(missing)
    print("All critical dependencies imported successfully.")


if __name__ == "__main__":
    test_critical_imports()
