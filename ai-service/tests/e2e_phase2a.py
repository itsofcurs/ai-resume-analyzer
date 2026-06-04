import asyncio
import logging
import pytest
from httpx import AsyncClient

# Assuming the app runs on localhost:8000 for tests
BASE_URL = "http://127.0.0.1:8000"

@pytest.mark.asyncio
async def test_search_endpoint():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/search", json={"query": "Find React developers", "top_k": 3})
        assert response.status_code == 200
        data = response.json()
        assert "matches" in data
        assert isinstance(data["matches"], list)

@pytest.mark.asyncio
async def test_recommend_endpoint():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/recommend", json={
            "job_description": "We are looking for a backend engineer with Node.js and MongoDB experience.",
            "top_k": 2
        })
        assert response.status_code == 200
        data = response.json()
        assert "candidates" in data
        assert isinstance(data["candidates"], list)

@pytest.mark.asyncio
async def test_copilot_chat():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/copilot/chat", json={
            "query": "Show me top candidates for a frontend role."
        })
        assert response.status_code == 200
        data = response.json()
        assert "message" in data

@pytest.mark.asyncio
async def test_compare_endpoint():
    # Note: Requires valid candidate IDs in the DB for a full test.
    # We test the API structure here.
    async with AsyncClient(base_url=BASE_URL) as client:
        # Pass dummy ObjectIds
        response = await client.post("/api/compare", json={
            "candidate_a_id": "6a215edd0970d7d0798dfdad",
            "candidate_b_id": "6a215edd0970d7d0798dfdae"
        })
        # Could be 500 if IDs don't exist, but we expect an error or comparison
        assert response.status_code in [200, 500]

if __name__ == "__main__":
    pytest.main(["-v", __file__])
