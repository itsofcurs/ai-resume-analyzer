"""
utils/llm_output_guardrails.py
------------------------------
Shared guardrails for consuming LLM outputs in production.

Goals:
  - Never allow raw LLM text to leak into API responses.
  - Enforce strict JSON-only parsing.
  - Provide one safe retry mechanism for malformed JSON.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from utils.parser_utils import clean_json_str


@dataclass(frozen=True)
class SafeJsonParseResult:
    ok: bool
    data: dict[str, Any] | None
    error: str | None = None


_JSON_OBJECT_RE = re.compile(r"\{[\s\S]*\}")


def safe_json_parser(raw_text: str) -> SafeJsonParseResult:
    """
    Parse a strict JSON object from an LLM response.

    Strategy:
      1) Strip common markdown fences.
      2) Attempt json.loads().
      3) If it fails, extract the first {...} JSON object substring and retry.

    Returns:
      SafeJsonParseResult(ok=True, data=dict) on success, otherwise ok=False.
    """
    if not raw_text or not str(raw_text).strip():
        return SafeJsonParseResult(ok=False, data=None, error="empty_response")

    cleaned = clean_json_str(str(raw_text))

    # Attempt 1: direct parse
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return SafeJsonParseResult(ok=True, data=parsed)
        return SafeJsonParseResult(ok=False, data=None, error="json_not_object")
    except json.JSONDecodeError:
        pass

    # Attempt 2: extract first JSON object
    match = _JSON_OBJECT_RE.search(cleaned)
    if not match:
        return SafeJsonParseResult(ok=False, data=None, error="no_json_object_found")

    try:
        parsed = json.loads(match.group(0))
        if isinstance(parsed, dict):
            return SafeJsonParseResult(ok=True, data=parsed)
        return SafeJsonParseResult(ok=False, data=None, error="json_not_object")
    except json.JSONDecodeError as exc:
        return SafeJsonParseResult(ok=False, data=None, error=f"json_decode_error:{exc}")

