import pytest
from database import get_mongo_collection
from httpx import AsyncClient

# To run tests locally: pytest tests/e2e_interview_evaluation.py -v -s


@pytest.fixture
async def mock_resume_id():
    """Create a mock resume in the database for testing"""
    collection = get_mongo_collection()
    mock_resume = {
        "filename": "test_candidate.pdf",
        "rawText": "Mock text",
        "parsedData": {
            "name": "Test Candidate",
            "skills": ["Python", "React", "Node.js"],
            "experience": "5 years of full stack development",
        },
        "organizationId": "test_org",
        "uploadedBy": "test_user",
    }
    result = await collection.insert_one(mock_resume)
    yield str(result.inserted_id)
    await collection.delete_one({"_id": result.inserted_id})


@pytest.mark.asyncio
async def test_perfect_answers(mock_resume_id):
    async with AsyncClient(base_url="http://127.0.0.1:8000", timeout=60.0) as client:
        response = await client.post(
            "/api/interview/evaluate",
            json={
                "resume_id": mock_resume_id,
                "answers": [
                    {
                        "question": "Can you explain React hooks?",
                        "answer": "React hooks allow us to use state and other React features in functional components. For example, useState manages state, useEffect handles side effects, and custom hooks let us extract component logic.",
                    },
                    {
                        "question": "How do you handle conflict in a team?",
                        "answer": "I address conflicts directly but empathetically. I schedule a 1-on-1, actively listen to understand their perspective, and work collaboratively to find a mutually beneficial solution focused on project goals.",
                    },
                ],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "overallScore" in data
        assert data["overallScore"] >= 80  # Perfect answers should score high
        assert "strengths" in data
        assert len(data["strengths"]) > 0


@pytest.mark.asyncio
async def test_weak_answers(mock_resume_id):
    async with AsyncClient(base_url="http://127.0.0.1:8000", timeout=60.0) as client:
        response = await client.post(
            "/api/interview/evaluate",
            json={
                "resume_id": mock_resume_id,
                "answers": [
                    {
                        "question": "Can you explain React hooks?",
                        "answer": "Uh, I don't really know, I just use classes.",
                    },
                    {
                        "question": "How do you handle conflict in a team?",
                        "answer": "I just ignore it and hope it goes away.",
                    },
                ],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["overallScore"] < 60  # Weak answers should score low
        assert "weaknesses" in data
        assert len(data["weaknesses"]) > 0


@pytest.mark.asyncio
async def test_empty_answers(mock_resume_id):
    async with AsyncClient(base_url="http://127.0.0.1:8000", timeout=60.0) as client:
        response = await client.post(
            "/api/interview/evaluate",
            json={
                "resume_id": mock_resume_id,
                "answers": [{"question": "Can you explain React hooks?", "answer": ""}],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["overallScore"] < 50


@pytest.mark.asyncio
async def test_malformed_input(mock_resume_id):
    async with AsyncClient(base_url="http://127.0.0.1:8000", timeout=60.0) as client:
        # Missing answers array
        response = await client.post(
            "/api/interview/evaluate", json={"resume_id": mock_resume_id}
        )
        assert response.status_code == 422  # FastAPI validation error
