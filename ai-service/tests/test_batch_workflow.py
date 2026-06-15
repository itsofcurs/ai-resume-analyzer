import json

import agents.ats_scorer as ats_mod
from schemas.ranking_schema import BatchRankingRequestSchema
from schemas.resume_schema import ResumeParseResponse
from workflows.batch_job_match_workflow import BatchJobMatchWorkflow


def _run(coro):
    import asyncio

    return asyncio.run(coro)


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


class FakeParser:
    async def aparse(self, raw_text):
        if "FAIL" in raw_text:
            raise ValueError("forced failure")
        return ResumeParseResponse(
            name="Parsed Candidate",
            skills=["python", "fastapi"],
        )


class SlowParser:
    async def aparse(self, raw_text):
        import asyncio

        await asyncio.sleep(0.2)
        return ResumeParseResponse(
            name="Slow Candidate",
            skills=["python"],
        )


async def _batch_workflow_success(monkeypatch):
    monkeypatch.setattr(
        ats_mod.ATSScoringAgent, "_get_reasoning_chain", lambda self: FakeChain()
    )

    import embeddings as emb

    monkeypatch.setattr(emb, "generate_embedding", lambda text: [1.0, 0.0, 0.0])

    from services.cache_service import cache_service

    cache_service.clear()

    wf = BatchJobMatchWorkflow(parser_agent=FakeParser())
    req = BatchRankingRequestSchema(
        resumes=[
            {
                "candidate_id": "c1",
                "candidate_name": "Alice",
                "resume_text": "Alice skills python fastapi",
            },
            {
                "candidate_id": "c2",
                "candidate_name": "Bob",
                "resume_text": "Bob skills python fastapi",
            },
        ],
        job_description_text="Need python fastapi backend engineer",
        required_skills=["python", "fastapi"],
        preferred_skills=["kafka"],
        top_k=1,
    )
    out = await wf.run(req)
    assert out.total_candidates == 2
    assert len(out.ranked_candidates) == 2
    assert len(out.shortlisted_candidates) == 1
    assert out.processing_summary.workflow_id
    assert out.processing_summary.recruiter_analytics
    analytics = out.processing_summary.recruiter_analytics
    assert analytics.shortlist_counts["STRONG_MATCH"] >= 0
    assert "p50" in analytics.percentile_distribution
    assert analytics.semantic_alignment_average >= 0


def test_batch_workflow_success(monkeypatch):
    _run(_batch_workflow_success(monkeypatch))


async def _batch_workflow_partial_failure(monkeypatch):
    monkeypatch.setattr(
        ats_mod.ATSScoringAgent, "_get_reasoning_chain", lambda self: FakeChain()
    )

    import embeddings as emb

    monkeypatch.setattr(emb, "generate_embedding", lambda text: [1.0, 0.0, 0.0])

    from services.cache_service import cache_service

    cache_service.clear()

    wf = BatchJobMatchWorkflow(parser_agent=FakeParser(), max_retries=0)
    req = BatchRankingRequestSchema(
        resumes=[
            {
                "candidate_id": "c1",
                "candidate_name": "Alice",
                "resume_text": "Alice skills python fastapi",
            },
            {
                "candidate_id": "c2",
                "candidate_name": "Bob",
                "resume_text": "FAIL resume text with enough chars",
            },
        ],
        job_description_text="Need python fastapi backend engineer",
        required_skills=["python", "fastapi"],
        preferred_skills=["kafka"],
        top_k=2,
    )
    out = await wf.run(req)
    assert out.total_candidates == 2
    assert len(out.ranked_candidates) == 1
    assert "c2" in out.processing_summary.failed_candidates


def test_batch_workflow_partial_failure(monkeypatch):
    _run(_batch_workflow_partial_failure(monkeypatch))


async def _batch_workflow_timeout(monkeypatch):
    monkeypatch.setattr(
        ats_mod.ATSScoringAgent, "_get_reasoning_chain", lambda self: FakeChain()
    )

    import embeddings as emb

    monkeypatch.setattr(emb, "generate_embedding", lambda text: [1.0, 0.0, 0.0])

    from services.cache_service import cache_service

    cache_service.clear()

    wf = BatchJobMatchWorkflow(
        parser_agent=SlowParser(), parse_timeout_s=0.05, max_retries=0
    )
    req = BatchRankingRequestSchema(
        resumes=[
            {
                "candidate_id": "c1",
                "candidate_name": "Alice",
                "resume_text": "Alice skills python fastapi",
            },
        ],
        job_description_text="Need python fastapi backend engineer",
        required_skills=["python", "fastapi"],
        preferred_skills=["kafka"],
        top_k=1,
    )
    out = await wf.run(req)
    assert len(out.ranked_candidates) == 0
    assert "c1" in out.processing_summary.failed_candidates


def test_batch_workflow_timeout(monkeypatch):
    _run(_batch_workflow_timeout(monkeypatch))
