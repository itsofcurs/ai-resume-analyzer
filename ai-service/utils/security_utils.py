import logging
import re

logger = logging.getLogger(__name__)

# Basic heuristics for detecting injection patterns
INJECTION_PATTERNS = [
    r"ignore all previous",
    r"disregard previous",
    r"system prompt",
    r"forget your instructions",
    r"you are now",
    r"override rules",
]


def sanitize_user_prompt(text: str, max_length: int = 1000) -> str:
    """
    Sanitizes user input to prevent basic prompt injection attacks and enforce length limits.
    """
    if not text:
        return ""

    # Enforce length limit
    sanitized = text[:max_length]

    # Check for basic injection patterns
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, sanitized, re.IGNORECASE):
            logger.warning(f"[SECURITY] Potential prompt injection detected: {pattern}")
            # Neutralize the query if injection is detected
            return "Explain that the input contained restricted instructions and cannot be processed."

    return sanitized
