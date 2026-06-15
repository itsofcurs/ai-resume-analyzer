import json

import agents.ats_scorer as ats_mod
import pytest
from schemas.job_match_schema import JobMatchRequestSchema
from workflows.job_match_workflow import JobMatchWorkflow


def _run(coro):
    import asyncio

    return asyncio.run(coro)


async def _job_match_workflow_success_with_llm_mock(monkeypatch):
    # Mock Gemini reasoning output so tests are deterministic and offline.
    class FakeChain:
        async def ainvoke(self, payload):
            return json.dumps(
                {
                    "reasoning_summary": "ok",
                    "strengths": ["s1"],
                    "weaknesses": ["w1"],
                    "recommendation": "Interview Recommended",
                    "llm_confidence_score": 80,
                }
            )

    monkeypatch.setattr(
        ats_mod.ATSScoringAgent, "_get_reasoning_chain", lambda self: FakeChain()
    )

    # Mock embeddings to avoid model download
    import embeddings as emb

    monkeypatch.setattr(emb, "generate_embedding", lambda text: [1.0, 0.0, 0.0])

    wf = JobMatchWorkflow()
    req = JobMatchRequestSchema(
        resume_text="Jane Doe\nSkills: python fastapi mongodb\nExperience: backend engineer",
        job_description_text="Need backend engineer with python fastapi mongodb",
        required_skills=["python", "fastapi", "mongodb"],
        preferred_skills=["kafka"],
        required_keywords=["microservices"],
    )
    out = await wf.run(req)
    assert 0 <= out.final_ats_score <= 100
    assert out.reasoning.recommendation in (
        "Interview Recommended",
        "Maybe",
        "Not Recommended",
    )
    assert "parse_ms" in out.stage_timings_ms


def test_job_match_workflow_success_with_llm_mock_sync(monkeypatch):
    # Same test but run with asyncio.run so no pytest-asyncio plugin required.
    _run(_job_match_workflow_success_with_llm_mock(monkeypatch))


def test_job_match_request_validation_rejects_empty():
    with pytest.raises(Exception):
        JobMatchRequestSchema(
            resume_text="",
            job_description_text="",
            required_skills=[],
        )
