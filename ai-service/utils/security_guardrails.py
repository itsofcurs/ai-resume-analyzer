"""
utils/security_guardrails.py
----------------------------
Security and safety guardrails for LLM inputs.
"""

from __future__ import annotations

import re
from typing import Tuple

from core.errors import InvalidResumeError

from utils.parser_utils import truncate_text

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")
_ROLE_LINE = re.compile(r"^\s*(system|assistant|developer|user)\s*[:=]", re.IGNORECASE)
_PROMPT_INJECTION = re.compile(
    r"(ignore\s+previous|system\s+prompt|prompt\s+injection|"
    r"jailbreak|act\s+as\s+system|developer\s+message|"
    r"do\s+not\s+follow|override\s+instructions)",
    re.IGNORECASE,
)
_TAG_BLOCKS = re.compile(
    r"<\s*/?\s*(system|assistant|developer|user)\s*>", re.IGNORECASE
)


def sanitize_text(text: str) -> str:
    if text is None:
        return ""
    cleaned = _CONTROL_CHARS.sub(" ", str(text))
    cleaned = cleaned.replace("\u2028", " ").replace("\u2029", " ")
    return cleaned


def strip_prompt_injection(text: str) -> str:
    if not text:
        return ""
    safe_lines = []
    for line in text.splitlines():
        if _ROLE_LINE.search(line):
            continue
        if _PROMPT_INJECTION.search(line):
            continue
        safe_lines.append(line)
    cleaned = "\n".join(safe_lines)
    cleaned = _TAG_BLOCKS.sub("", cleaned)
    return cleaned


def prepare_llm_input(text: str, *, max_chars: int | None = None) -> Tuple[str, bool]:
    """
    Sanitize and strip prompt injection patterns before sending to LLMs.

    Returns:
        (safe_text, injection_detected)
    """
    sanitized = sanitize_text(text)
    injection_detected = bool(
        _PROMPT_INJECTION.search(sanitized) or _ROLE_LINE.search(sanitized)
    )
    scrubbed = strip_prompt_injection(sanitized)
    if max_chars:
        scrubbed = truncate_text(scrubbed, max_chars=max_chars)
    return scrubbed, injection_detected


def validate_resume_text(text: str) -> None:
    if not text or not str(text).strip():
        raise InvalidResumeError("Resume text is empty or invalid.")
