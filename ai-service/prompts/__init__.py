"""
prompts/
--------
Centralized LangChain PromptTemplate repository.

Separating prompts from agent logic enables:
  - A/B testing of prompt versions without touching agent code
  - Prompt versioning and auditability
  - Easy re-use across multiple agents

Current templates:
  - RESUME_PARSER_PROMPT  → full structured resume extraction + authenticity audit
"""

from prompts.ats_reasoning_prompt import ATS_REASONING_PROMPT
from prompts.resume_parser_prompt import RESUME_PARSER_PROMPT

__all__ = ["RESUME_PARSER_PROMPT", "ATS_REASONING_PROMPT"]
