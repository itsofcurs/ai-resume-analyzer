import os
import sys

# Ensure `ai-service/` is on sys.path so imports like `from services...` work in tests.
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

# Default test environment safety: do not require external LLM credentials.
os.environ.setdefault("LLM_ENABLED", "false")
