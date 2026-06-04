# Phase 7: LangChain Agent Architecture Report

**Date:** June 4, 2026

## 1. Action Items Completed
- **Recruiter Copilot Agent** (`ai-service/agents/recruiter_copilot.py`):
  - Created a conversational LangChain agent (`create_tool_calling_agent`) equipped with tools to execute semantic vector searches (`search_candidates_tool`) and retrieve deep parsed profile data from MongoDB (`get_candidate_details_tool`).
- **Candidate Guidance Agent** (`ai-service/agents/candidate_guidance.py`):
  - Created an AI career coach agent utilizing `analyze_resume_gaps_tool` to cross-reference a candidate's current extracted skills with arbitrary target job roles, providing tailored and constructive improvement advice.
- **Interview Preparation Agent** (`ai-service/agents/interview_agent.py`):
  - Created a specialized agent using `generate_interview_prep_tool` to dynamically generate technical and behavioral interview questions based on the candidate's exact parsed experience history and a target job description.

## 2. Technical Stack & Implementation Details
- **LLM Engine**: `GeminiService` (Google Gemini 2.5 Flash), initialized via LangChain's `ChatGoogleGenerativeAI`.
- **Agent Type**: Tool Calling Agents (OpenAI tools architecture supported by Gemini).
- **State Management**: `AgentExecutor` with a `chat_history` placeholder to allow multi-turn conversations when integrated into a stateful backend (like LangGraph in Phase 8).

## 3. Next Steps for LangGraph (Phase 8)
- These agents currently exist as modular functional units within the `ai-service/agents/` directory.
- In **Phase 8 (LangGraph Migration)**, we will refactor the sequential processing pipeline (`resume_workflow.py`) to use `langgraph.graph.StateGraph`. We can also integrate these agents as distinct nodes in a supervisor-managed LangGraph architecture, allowing for human-in-the-loop interventions or multi-agent debate (e.g. ATS Scorer debating with the Candidate Guidance agent).
