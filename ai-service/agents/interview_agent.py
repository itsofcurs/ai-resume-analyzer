"""
agents/interview_agent.py
-------------------------
Interview Preparation Agent using LangChain Tool Calling.

This agent acts as a technical interviewer and preparation assistant.
It reviews the candidate's resume and a target job description to generate
highly tailored technical and behavioral interview questions.
"""

import json
import logging

from bson import ObjectId
from database import get_mongo_collection
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from services.gemini_service import GeminiService

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LangChain Tools
# ---------------------------------------------------------------------------


@tool
async def generate_interview_prep_tool(resume_id: str, job_description: str) -> str:
    """
    Retrieve a candidate's resume and generate technical and behavioral interview questions
    based on their specific experience and the provided job description.
    Use this tool when a candidate asks for interview preparation.
    """
    try:
        collection = await get_mongo_collection()
        resume = await collection.find_one({"_id": ObjectId(resume_id)})
        if not resume:
            return "Candidate not found."

        parsed_data = resume.get("parsedData", {})

        return json.dumps(
            {
                "candidate_skills": parsed_data.get("skills", []),
                "candidate_experience": parsed_data.get("experience", []),
                "job_description": job_description,
                "instruction": "Generate 3 technical questions targeting the candidate's skills that overlap with the job description, and 2 behavioral questions based on their experience.",
            }
        )
    except Exception as e:
        logger.error(f"Error in generate_interview_prep_tool: {e}")
        return f"Error generating interview prep: {e}"


# ---------------------------------------------------------------------------
# Agent Configuration
# ---------------------------------------------------------------------------

INTERVIEW_SYSTEM_PROMPT = """You are TalentAI's Interview Preparation Coach.
Your goal is to help candidates ace their upcoming interviews by asking them realistic, challenging, and tailored questions.
You have access to the generate_interview_prep_tool, which retrieves their resume data and correlates it with a target job description.

Always provide a mix of technical and behavioral questions. After providing the questions, offer brief tips on how to structure their answers (e.g., using the STAR method).
"""


class InterviewPreparationAgent:
    """
    Conversational Agent Executor for Interview Preparation.
    """

    def __init__(self):
        self._llm = GeminiService.get_instance().get_llm()
        self._tools = [generate_interview_prep_tool]
        self._prompt = ChatPromptTemplate.from_messages(
            [
                ("system", INTERVIEW_SYSTEM_PROMPT),
                ("placeholder", "{chat_history}"),
                ("human", "{input}"),
                ("placeholder", "{agent_scratchpad}"),
            ]
        )
        self._agent = create_tool_calling_agent(self._llm, self._tools, self._prompt)
        self._agent_executor = AgentExecutor(
            agent=self._agent, tools=self._tools, verbose=True
        )

    async def chat(self, user_input: str, chat_history: list = None) -> str:
        """
        Process a candidate query and return interview questions/tips.
        """
        chat_history = chat_history or []
        try:
            response = await self._agent_executor.ainvoke(
                {"input": user_input, "chat_history": chat_history}
            )
            return response.get("output", "I'm sorry, I couldn't generate a response.")
        except Exception as e:
            logger.error(f"InterviewPreparationAgent failed: {e}")
            return "An error occurred while processing your request. Please try again later."
