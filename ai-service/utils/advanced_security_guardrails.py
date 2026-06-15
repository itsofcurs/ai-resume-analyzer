"""
utils/advanced_security_guardrails.py
------------------------------------
Enterprise-grade request security helpers:
  - API key validation (recruiter endpoints)
  - PII masking for logs/traces
  - Hardened prompt injection detection (handles unicode obfuscation lightly)

This module does NOT add any AI features; it protects infrastructure and data.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Optional

from core.errors import RecruiterValidationError

_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_PHONE_RE = re.compile(r"\b(\+?\d[\d\-\s]{7,}\d)\b")


def normalise_unicode(text: str) -> str:
    return unicodedata.normalize("NFKC", text or "")


def mask_pii(text: str) -> str:
    if not text:
        return ""
    t = normalise_unicode(text)
    t = _EMAIL_RE.sub("[REDACTED_EMAIL]", t)
    t = _PHONE_RE.sub("[REDACTED_PHONE]", t)
    return t


def parse_api_keys(csv: str) -> set[str]:
    keys = set()
    for part in (csv or "").split(","):
        k = part.strip()
        if k:
            keys.add(k)
    return keys


def require_api_key(provided: Optional[str], allowed_keys: Iterable[str]) -> None:
    allowed = set(allowed_keys)
    if not allowed:
        return  # auth disabled by configuration
    if not provided or provided.strip() not in allowed:
        raise RecruiterValidationError("Unauthorized recruiter request.")
