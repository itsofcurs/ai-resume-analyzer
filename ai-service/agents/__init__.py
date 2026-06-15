"""
agents/
-------
LangChain-ready agent modules for the AI Hiring Intelligence Platform.

Each agent encapsulates a single, reusable AI capability:
  - ResumeParserAgent   → structured extraction from raw resume text
  - [future] ATSScoringAgent         → ATS / JD fit scoring
  - [future] SkillGapAgent           → gap analysis against job requirements
  - [future] CandidateRankingAgent   → ordered shortlist generation
  - [future] InterviewGenAgent       → targeted interview question generation

Agents are designed to be orchestrated by workflow/ modules and, in a
future iteration, by a LangGraph StateGraph router.
"""

from agents.ats_scorer import ATSScoringAgent
from agents.resume_parser import ResumeParserAgent

__all__ = ["ResumeParserAgent", "ATSScoringAgent"]
