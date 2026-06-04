"""
agents/recruiter_copilot.py
---------------------------
Recruiter Copilot Agent using LangChain Tool Calling.

This agent acts as an AI assistant for recruiters. It has access to tools
that allow it to search the ChromaDB vector database and fetch full candidate profiles
from MongoDB, providing conversational insights.
"""

import json
import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langchain.agents import create_tool_calling_agent, AgentExecutor

from services.gemini_service import GeminiService
from database import vector_search, get_mongo_collection
from embeddings import generate_query_embedding
from bson import ObjectId

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LangChain Tools
# ---------------------------------------------------------------------------

@tool
async def search_candidates_tool(query: str, top_k: int = 5) -> str:
    """
    Search for candidates using semantic similarity.
    Use this tool when a recruiter asks to find candidates matching specific skills or job descriptions.
    """
    try:
        query_vector = generate_query_embedding(query)
        matches = await vector_search(query_vector, top_k=top_k)
        if not matches:
            return "No matching candidates found."
        return json.dumps(matches, default=str)
    except Exception as e:
        logger.error(f"Error in search_candidates_tool: {e}")
        return f"Error executing search: {e}"

@tool
async def get_candidate_details_tool(resume_id: str) -> str:
    """
    Retrieve detailed parsed information (skills, experience, education) about a specific candidate.
    Use this tool when you need more details about a candidate returned by the search tool.
    """
    try:
        collection = await get_mongo_collection()
        resume = await collection.find_one({"_id": ObjectId(resume_id)})
        if not resume:
            return "Candidate not found."
        
        parsed_data = resume.get("parsedData", {})
        return json.dumps(parsed_data, default=str)
    except Exception as e:
        logger.error(f"Error in get_candidate_details_tool: {e}")
        return f"Error retrieving candidate details: {e}"

# ---------------------------------------------------------------------------
# Agent Configuration
# ---------------------------------------------------------------------------

RECRUITER_SYSTEM_PROMPT = """You are TalentAI's Recruiter Copilot, an expert AI recruitment assistant.
Your job is to help recruiters find and evaluate candidates efficiently.
You have access to two tools:
1. search_candidates_tool: To find relevant candidates based on semantic queries.
2. get_candidate_details_tool: To retrieve full structured data (experience, education) for a specific candidate ID.

When asked to find candidates, use the search tool. If the recruiter asks for a summary or details about a specific candidate, use the details tool.
Always provide concise, professional, and data-driven responses. Highlight key strengths and potential red flags based on the data provided.
"""

class RecruiterCopilotAgent:
    """
    Conversational Agent Executor for Recruiter Copilot.
    """
    def __init__(self):
        self._llm = GeminiService.get_instance().get_llm()
        self._tools = [search_candidates_tool, get_candidate_details_tool]
        self._prompt = ChatPromptTemplate.from_messages([
            ("system", RECRUITER_SYSTEM_PROMPT),
            ("placeholder", "{chat_history}"),
            ("human", "{input}"),
            ("placeholder", "{agent_scratchpad}"),
        ])
        self._agent = create_tool_calling_agent(self._llm, self._tools, self._prompt)
        self._agent_executor = AgentExecutor(agent=self._agent, tools=self._tools, verbose=True)

    async def chat(self, user_input: str, chat_history: list = None) -> str:
        """
        Process a recruiter query and return the assistant's response.
        """
        chat_history = chat_history or []
        try:
            response = await self._agent_executor.ainvoke({
                "input": user_input,
                "chat_history": chat_history
            })
            return response.get("output", "I'm sorry, I couldn't generate a response.")
        except Exception as e:
            logger.error(f"RecruiterCopilotAgent failed: {e}")
            return "An error occurred while processing your request. Please try again later."
