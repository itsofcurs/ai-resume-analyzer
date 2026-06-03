"""
utils/parser_utils.py
---------------------
Shared text-processing helpers used across the entire AI pipeline.

Centralising these utilities prevents duplicated logic across agents,
services, and workflows and ensures consistent output quality.
"""

import re
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Blacklisted strings that are NOT valid candidate names.
# These are technical terms / noise that Gemini occasionally mis-extracts.
_INVALID_NAME_TOKENS: list[str] = [
    "redis",
    "machine learning",
    "machinelearning",
    "unknown",
    "unknown candidate",
    "resume",
    "skills",
    "curriculum vitae",
    "cv",
    "node.js",
    "nodejs",
    "docker",
    "kubernetes",
    "java",
    "python",
    "react",
    "angular",
    "vue",
    "aws",
    "gcp",
    "azure",
    "sql",
    "html",
    "css",
]

# Maximum character count sent to Gemini to stay within context limits.
# Gemini 1.5-flash supports ~1M tokens; 6000 chars ≈ 1500 tokens — safe
# for most resumes while avoiding excessive latency.
DEFAULT_PROMPT_CHAR_LIMIT: int = 6_000

# Maximum character count sent to sentence-transformers.
# bge-small-en-v1.5 max sequence = 512 tokens ≈ 2000 chars.
DEFAULT_EMBEDDING_CHAR_LIMIT: int = 2_000


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def sanitize_name(name: str) -> str:
    """
    Validate and normalise a candidate name extracted by an LLM.

    Rules:
      - Strips leading/trailing whitespace.
      - Returns "Unknown Candidate" if the value is empty, too short,
        contains a blacklisted technical token, or matches a generic
        placeholder pattern.

    Args:
        name: Raw name string returned by the LLM.

    Returns:
        A clean name string, or "Unknown Candidate" as a safe fallback.

    Examples:
        >>> sanitize_name("Jane Doe")
        'Jane Doe'
        >>> sanitize_name("Redis")
        'Unknown Candidate'
        >>> sanitize_name("")
        'Unknown Candidate'
    """
    if not name:
        return "Unknown Candidate"

    stripped = name.strip()

    # Must have at least 2 characters
    if len(stripped) < 2:
        return "Unknown Candidate"

    lower = stripped.lower()

    # Check against the blacklist
    for bad_token in _INVALID_NAME_TOKENS:
        if bad_token in lower:
            logger.debug(
                "sanitize_name: rejecting '%s' — matched blacklist token '%s'",
                stripped,
                bad_token,
            )
            return "Unknown Candidate"

    return stripped


def truncate_text(text: str, max_chars: int = DEFAULT_PROMPT_CHAR_LIMIT) -> str:
    """
    Safely truncate text to a maximum character count.

    Used before sending text to LLMs or embedding models to avoid
    exceeding context window limits or incurring unnecessary API costs.

    Args:
        text:      The raw input string.
        max_chars: Maximum number of characters to retain.
                   Defaults to DEFAULT_PROMPT_CHAR_LIMIT (6000).

    Returns:
        The original string if within limit, otherwise the first
        `max_chars` characters.

    Examples:
        >>> truncate_text("hello world", max_chars=5)
        'hello'
    """
    if not text:
        return ""
    return text[:max_chars]


def clean_json_str(raw: str) -> str:
    """
    Strip markdown code fences from an LLM JSON response.

    Gemini (and other LLMs) sometimes wrap JSON in ```json ... ``` blocks
    even when instructed not to. This function reliably removes those fences
    so the result can be passed directly to json.loads().

    Args:
        raw: Raw string response from the LLM.

    Returns:
        A cleaned string suitable for json.loads().

    Examples:
        >>> clean_json_str('```json\\n{"key": "value"}\\n```')
        '{"key": "value"}'
    """
    cleaned = raw.strip()
    # Remove ```json ... ``` or ``` ... ``` wrappers
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()
