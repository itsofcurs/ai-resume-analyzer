from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Import the new LangGraph workflow
from workflows.resume_workflow import ResumeWorkflow


@pytest.fixture
def mock_get_mongo_collection():
    with patch("workflows.resume_workflow.get_mongo_collection") as mock:
        mock_collection = MagicMock()
        mock_collection.update_one = AsyncMock()
        mock.return_value = mock_collection
        yield mock


@pytest.fixture
def mock_store_vector():
    with patch("workflows.resume_workflow.store_vector") as mock:
        yield mock


@pytest.fixture
def mock_extract_text():
    with patch("workflows.resume_workflow.download_and_extract_text") as mock:
        yield mock


@pytest.mark.asyncio
async def test_workflow_extract_text_failure(
    mock_extract_text, mock_get_mongo_collection
):
    """Test that if text extraction fails, the pipeline transitions to handle_failure."""
    mock_extract_text.return_value = ""  # Empty text should cause an error

    workflow = ResumeWorkflow()

    # We can invoke the graph directly
    initial_state = {
        "resume_id": "507f1f77bcf86cd799439011",
        "cloudinary_url": "http://fake-url.com/resume.pdf",
        "filename": "resume.pdf",
        "raw_text": None,
        "parsed": None,
        "vector": None,
        "vector_stored": False,
        "error": None,
    }

    final_state = await workflow._graph.ainvoke(initial_state)

    assert final_state["error"] == "Extracted text is empty"
    # Ensure Mongo was called to mark as FAILED
    # Actually, we mocked get_mongo_collection so we can check if it was called
    assert mock_get_mongo_collection.called
