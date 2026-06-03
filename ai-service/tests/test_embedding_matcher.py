import math

from services.embedding_matcher import EmbeddingMatcher
from schemas.resume_schema import ResumeParseResponse


def test_embedding_matcher_similarity_consistency_monkeypatched(monkeypatch):
    # Avoid loading real sentence-transformers model in unit tests.
    def fake_embed(text: str):
        # Very simple stable embedding based on character counts
        n = float(len(text))
        return [n, n / 2.0, 1.0]

    import embeddings as emb
    monkeypatch.setattr(emb, "generate_embedding", fake_embed)

    matcher = EmbeddingMatcher()
    resume = ResumeParseResponse(name="X", skills=["python", "fastapi"])

    out1 = matcher.score(resume=resume, job_description_text="python fastapi backend")
    out2 = matcher.score(resume=resume, job_description_text="python fastapi backend")

    assert out1["embedding_similarity_score"] == out2["embedding_similarity_score"]
    assert math.isfinite(out1["cosine_similarity"])


def test_embedding_matcher_low_similarity_monkeypatched(monkeypatch):
    def embed_a(text: str):
        return [1.0, 0.0, 0.0]

    def embed_b(text: str):
        return [0.0, 1.0, 0.0]

    calls = {"n": 0}

    def fake_embed(text: str):
        calls["n"] += 1
        return embed_a(text) if calls["n"] == 1 else embed_b(text)

    import embeddings as emb
    monkeypatch.setattr(emb, "generate_embedding", fake_embed)

    matcher = EmbeddingMatcher()
    resume = ResumeParseResponse(name="X", skills=["python"])
    out = matcher.score(resume=resume, job_description_text="java")
    assert out["embedding_similarity_score"] <= 60

