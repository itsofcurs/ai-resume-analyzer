"""
prompts/resume_parser_prompt.py
--------------------------------
LangChain PromptTemplate for the ResumeParserAgent.

Design principles:
  - Single, versioned prompt owned by this file.
  - Decoupled from agent logic so prompts can be A/B tested independently.
  - Strict output-format instructions to maximise JSON parse reliability.
  - Embeds all guardrails from the original nlp_pipeline.analyze_resume_unified()
    so there is zero regression in extraction quality.

Template input variable:
  {resume_text}  — truncated raw text of the resume (max 6000 chars).

Expected output:
  A single valid JSON object matching the ResumeParseResponse schema.

Versioning convention:
  When updating this prompt, increment PROMPT_VERSION and keep the old
  version as a commented block for reference / rollback purposes.

Future prompts to add here (or in separate files):
  - ATS_SCORING_PROMPT          → fit % against a job description
  - SKILL_GAP_PROMPT            → missing skills vs. job requirements
  - INTERVIEW_GEN_PROMPT        → tailored interview question generation
  - CANDIDATE_RANKING_PROMPT    → ordered shortlist justification
"""

from langchain_core.prompts import PromptTemplate

# ---------------------------------------------------------------------------
# Version tracking
# ---------------------------------------------------------------------------

PROMPT_VERSION: str = "1.0.0"

# ---------------------------------------------------------------------------
# Template string
# ---------------------------------------------------------------------------

import datetime

_RESUME_PARSER_TEMPLATE: str = (
    """\
You are an expert technical recruiter and senior HR auditor with 15+ years of \
experience evaluating software engineering resumes.

IMPORTANT CONTEXT: Today's date is """
    + datetime.datetime.now().strftime("%Y-%m-%d")
    + """. 
Do NOT flag dates from the past (such as 2024, 2025, or early 2026) as being in the future.

Your task is to perform two operations simultaneously on the resume text below:
  1. Extract structured candidate information.
  2. Conduct an honest authenticity and AI-generation audit.

=== EXTRACTION RULES ===

NAME:
  - Extract the candidate's actual first + last name (usually the largest text at top).
  - NEVER extract technical terms, skills, tools, or programming languages as the name.
    Examples of INVALID names: "Redis", "Machine Learning", "Node.js", "Docker", "Java".
  - If no valid human name is found, use exactly: "Unknown Candidate"

EMAIL:
  - Extract the primary email address. Use null if not present.

PHONE:
  - Extract the primary phone number including country code if shown.
    Use null if not present.

SKILLS:
  - Return a clean, flat list of technical skills explicitly mentioned.
  - Include: programming languages, frameworks, libraries, cloud platforms,
    databases, tools, methodologies (e.g. Agile, TDD).
  - Normalise casing (use "React" not "react", "PostgreSQL" not "postgresql").
  - Deduplicate — each skill appears at most once.

EXPERIENCE:
  - Extract all work experience entries as an array.
  - Each entry must have: role, company, duration (date range string), description.
  - Most recent role first.

EDUCATION:
  - Extract all educational qualifications as an array.
  - Each entry must have: degree, institution, year, grade (null if not stated).
  - Most recent first.

PROJECTS:
  - Extract notable personal / academic / open-source projects.
  - Each entry: name, description, tech_stack (array), url (null if absent).

=== AUTHENTICITY AUDIT RULES ===

authenticity_score (0–100):
  - Score ABOVE 80 for typical well-written developer resumes.
  - Score BELOW 70 ONLY if you detect at least ONE of:
      * Illogical / impossible employment date overlaps (e.g. two full-time
        on-site roles in different cities at exactly the same dates).
      * Copy-pasted job descriptions identical across multiple roles.
      * Extreme keyword stuffing with no supporting project/company context.
  - DO NOT penalise for having many skills — that is normal for senior devs.

ai_generated_probability (0–100):
  - High (>60) ONLY if the entire resume reads like a generic AI template:
    no specific company names, no concrete metrics, no personal voice.
  - Standard professional resumes score LOW (< 30) here.

red_flags (array of strings):
  - List ONLY concrete, specific findings (e.g. "Employment at CompanyA and
    CompanyB both listed as Jan 2022 – Dec 2023 simultaneously").
  - Return an empty array [] if no genuine issues are found.
  - DO NOT invent red flags.

technical_depth_score (0–100):
  - High (>80) for resumes with specific project outcomes, metrics, system
    scale indicators, or advanced architectural decisions.
  - Medium (50–79) for standard CRUD / standard toolchain experience.
  - Low (<50) for vague, generic, or junior-level descriptions.

=== OUTPUT FORMAT ===

Return ONLY a single, valid JSON object. No markdown fences, no commentary,
no explanation — just the JSON.

{{
  "name": "string — candidate full name or 'Unknown Candidate'",
  "email": "string or null",
  "phone": "string or null",
  "skills": ["string", "..."],
  "experience": [
    {{
      "role": "string",
      "company": "string",
      "duration": "string",
      "description": "string"
    }}
  ],
  "education": [
    {{
      "degree": "string",
      "institution": "string",
      "year": "string",
      "grade": "string or null"
    }}
  ],
  "projects": [
    {{
      "name": "string",
      "description": "string",
      "tech_stack": ["string", "..."],
      "url": "string or null"
    }}
  ],
  "authenticity_score": integer (0-100),
  "ai_generated_probability": integer (0-100),
  "red_flags": ["string", "..."],
  "technical_depth_score": integer (0-100)
}}

=== RESUME TEXT ===

{resume_text}
"""
)

# ---------------------------------------------------------------------------
# Public PromptTemplate instance
# ---------------------------------------------------------------------------

RESUME_PARSER_PROMPT: PromptTemplate = PromptTemplate(
    input_variables=["resume_text"],
    template=_RESUME_PARSER_TEMPLATE,
)
"""
LangChain PromptTemplate for structured resume parsing + authenticity audit.

Usage:
    from prompts.resume_parser_prompt import RESUME_PARSER_PROMPT

    formatted = RESUME_PARSER_PROMPT.format(resume_text="Jane Doe\\nSoftware Engineer...")
    # Or use in a LangChain chain:
    chain = RESUME_PARSER_PROMPT | llm | StrOutputParser()
"""
