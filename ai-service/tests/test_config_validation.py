import os
import pytest

from core.config import Settings


def test_settings_requires_gemini_key_when_llm_enabled(monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "true")
    # Override any .env-sourced value
    monkeypatch.setenv("GEMINI_API_KEY", "")
    s = Settings()
    with pytest.raises(ValueError):
        s.validate_startup()


def test_settings_allows_missing_key_when_llm_disabled(monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "false")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    s = Settings()
    s.validate_startup()  # should not raise

