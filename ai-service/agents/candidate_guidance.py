"""
agents/candidate_guidance.py
----------------------------
Candidate Guidance Agent using LangChain Tool Calling.

This agent acts as an AI career coach for candidates. It can review a candidate's
resume profile and suggest improvements, identify missing skills for a target role,
and provide interview preparation tips.
"""

import json
import logging

from bson import ObjectId
from database import get_mongo_collection
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from services.llm.llm_router import LLMRouter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LangChain Tools
# ---------------------------------------------------------------------------


@tool
async def analyze_resume_gaps_tool(resume_id: str, target_role: str) -> str:
    """
    Retrieve a candidate's resume and perform a basic gap analysis against a target role.
    Use this tool when a candidate asks how they can improve their resume for a specific job title.
    """
    try:
        collection = await get_mongo_collection()
        resume = await collection.find_one({"_id": ObjectId(resume_id)})
        if not resume:
            return "Candidate not found."

        parsed_data = resume.get("parsedData", {})
        skills = parsed_data.get("skills", [])

        return json.dumps(
            {
                "current_skills": skills,
                "target_role": target_role,
                "instruction_to_llm": "Cross-reference the candidate's current skills with standard industry requirements for the target role. Highlight missing keywords and suggest improvements.",
            }
        )
    except Exception as e:
        logger.error(f"Error in analyze_resume_gaps_tool: {e}")
        return f"Error analyzing gaps: {e}"


# ---------------------------------------------------------------------------
# Agent Configuration
# ---------------------------------------------------------------------------

CANDIDATE_SYSTEM_PROMPT = """You are TalentAI's Candidate Career Coach, an expert AI advisor.
Your job is to help candidates improve their resumes and prepare for interviews.
You have access to the analyze_resume_gaps_tool, which retrieves their current resume data and helps identify gaps for a target role.

Always be encouraging, constructive, and highly specific in your advice. 
Do not hallucinate skills they don't have. Suggest concrete projects, certifications, or keywords they should learn or add to their resume to match their target role.
"""


class CandidateGuidanceAgent:
    """
    Conversational Agent Executor for Candidate Guidance.
    """

    def __init__(self):
        self._llm = LLMRouter.get_llm("guidance")
        self._tools = [analyze_resume_gaps_tool]
        self._prompt = ChatPromptTemplate.from_messages(
            [
                ("system", CANDIDATE_SYSTEM_PROMPT),
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
        Process a candidate query and return the coach's response.
        """
        chat_history = chat_history or []
        try:
            response = await self._agent_executor.ainvoke(
                {"input": user_input, "chat_history": chat_history}
            )
            return response.get("output", "I'm sorry, I couldn't generate a response.")
        except Exception as e:
            logger.error(f"CandidateGuidanceAgent failed: {e}")
            return "An error occurred while processing your request. Please try again later."
