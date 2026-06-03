from services.rule_based_scorer import RuleBasedScorer
from schemas.resume_schema import ResumeParseResponse, ExperienceSchema, EducationSchema


def test_rule_scorer_high_overlap():
    resume = ResumeParseResponse(
        name="Jane Doe",
        skills=["python", "fastapi", "mongodb", "docker"],
        experience=[ExperienceSchema(role="Backend Engineer", company="X", duration="2022-2024")],
        education=[EducationSchema(degree="B.Tech Computer Science", institution="Uni", year="2020")],
    )
    scorer = RuleBasedScorer()
    out = scorer.score(
        resume=resume,
        required_skills=["python", "fastapi", "mongodb"],
        preferred_skills=["kafka"],
        required_keywords=["microservices"],
        resume_profile_text="Built microservices in FastAPI with MongoDB",
        min_years_experience=2,
        required_degrees=["computer science"],
    )
    assert 0 <= out["rule_score"] <= 100
    assert out["skill_overlap"] >= 80
    assert "kafka" in out["missing_required_skills"] or out["missing_required_skills"] == []


def test_rule_scorer_missing_required_skills():
    resume = ResumeParseResponse(name="A", skills=["python"])
    scorer = RuleBasedScorer()
    out = scorer.score(resume=resume, required_skills=["python", "docker"])
    assert "docker" in out["missing_required_skills"]
    assert out["skill_overlap"] < 100

