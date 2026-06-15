from schemas.job_match_schema import (
    ATSReasoningSchema,
    EmbeddingScoreSchema,
    FinalATSAnalysisSchema,
    RuleBasedScoreSchema,
)
from services.candidate_ranker import (
    CandidateRanker,
    CandidateRankingInput,
    RankingThresholds,
)


def _analysis(final: int, rule: int, emb: int, conf: int) -> FinalATSAnalysisSchema:
    return FinalATSAnalysisSchema(
        final_ats_score=final,
        rule_score=rule,
        embedding_score=emb,
        llm_confidence_score=conf,
        rule_breakdown=RuleBasedScoreSchema(
            rule_score=rule,
            skill_overlap=rule,
            experience_match=rule,
            education_match=rule,
            keyword_match=rule,
            missing_required_skills=["kafka"],
            matched_required_skills=["python"],
        ),
        embedding_breakdown=EmbeddingScoreSchema(
            embedding_similarity_score=emb,
            cosine_similarity=0.75,
            semantic_alignment="Good semantic alignment with some potential gaps.",
        ),
        reasoning=ATSReasoningSchema(
            reasoning_summary="ok",
            strengths=["s1"],
            weaknesses=["w1"],
            recommendation="Interview Recommended",
            llm_confidence_score=conf,
        ),
    )


def test_candidate_ranker_tiebreak_and_labels():
    ranker = CandidateRanker(
        RankingThresholds(strong_match=85, good_match=70, borderline=55)
    )
    inputs = [
        CandidateRankingInput("c1", "Alice", _analysis(80, 70, 60, 50)),
        CandidateRankingInput("c2", "Bob", _analysis(80, 75, 55, 40)),
        CandidateRankingInput("c3", "Cara", _analysis(90, 88, 70, 60)),
    ]
    ranked, trace = ranker.rank(inputs)

    assert [c.candidate_id for c in ranked] == ["c3", "c2", "c1"]
    assert ranked[0].shortlist_label == "STRONG_MATCH"
    assert ranked[-1].shortlist_label == "GOOD_MATCH"
    assert "tie_breaker_order" in trace
