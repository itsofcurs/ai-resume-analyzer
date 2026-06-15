import time

from schemas.resume_schema import ResumeParseResponse
from services.cache_service import CacheService, InMemoryCacheBackend


def test_cache_metrics_hit_miss_eviction():
    backend = InMemoryCacheBackend()
    cache = CacheService(backend=backend, default_ttl=1)

    resume_text = "Jane Doe\nSkills: python"
    assert cache.get_cached_resume(resume_text) is None
    m = cache.metrics()
    assert m["misses"] >= 1

    cache.set_cached_resume(
        resume_text, ResumeParseResponse(name="Jane Doe", skills=["python"])
    )
    assert cache.get_cached_resume(resume_text) is not None
    m2 = cache.metrics()
    assert m2["hits"] >= 1
    assert m2["sets"] >= 1

    # TTL eviction
    time.sleep(1.1)
    assert cache.get_cached_resume(resume_text) is None
    m3 = cache.metrics()
    assert m3["evictions"] >= 1


from schemas.job_match_schema import (
    ATSReasoningSchema,
    EmbeddingScoreSchema,
    FinalATSAnalysisSchema,
    RuleBasedScoreSchema,
)
from schemas.resume_schema import ResumeParseResponse
from services.cache_service import CacheService


def _analysis(final: int) -> FinalATSAnalysisSchema:
    return FinalATSAnalysisSchema(
        final_ats_score=final,
        rule_score=final,
        embedding_score=final,
        llm_confidence_score=final,
        rule_breakdown=RuleBasedScoreSchema(
            rule_score=final,
            skill_overlap=final,
            experience_match=final,
            education_match=final,
            keyword_match=final,
            missing_required_skills=["kafka"],
            matched_required_skills=["python"],
        ),
        embedding_breakdown=EmbeddingScoreSchema(
            embedding_similarity_score=final,
            cosine_similarity=0.75,
            semantic_alignment="Good semantic alignment with some potential gaps.",
        ),
        reasoning=ATSReasoningSchema(
            reasoning_summary="ok",
            strengths=["s1"],
            weaknesses=["w1"],
            recommendation="Interview Recommended",
            llm_confidence_score=final,
        ),
    )


def test_cache_service_resume_embedding_ats():
    cache = CacheService()
    resume = ResumeParseResponse(name="Jane Doe", skills=["python"])
    cache.set_cached_resume("resume text", resume)
    cached_resume = cache.get_cached_resume("resume text")
    assert cached_resume is not None
    assert cached_resume.name == "Jane Doe"
    assert cache.metrics()["hits"] >= 1

    cache.set_cached_embedding("embed text", [1.0, 2.0])
    assert cache.get_cached_embedding("embed text") == [1.0, 2.0]

    analysis = _analysis(80)
    cache.set_cached_ats("resume text", "jd text", analysis, weights_signature="w1")
    assert (
        cache.get_cached_ats("resume text", "jd text", weights_signature="w1")
        is not None
    )
    assert (
        cache.get_cached_ats("resume text", "jd text", weights_signature="w2") is None
    )
