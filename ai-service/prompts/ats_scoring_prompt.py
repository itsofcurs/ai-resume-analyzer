"""
prompts/ats_scoring_prompt.py
------------------------------
Standalone ATS scoring prompt — evaluates resume quality WITHOUT a job description.

This prompt is used in the LangGraph pipeline to generate a standalone ATS score
at upload time, before any job matching occurs.
"""

from langchain_core.prompts import PromptTemplate

PROMPT_VERSION = "1.0.0"

ATS_SCORING_PROMPT = PromptTemplate.from_template(
    """You are a senior technical recruiter and ATS (Applicant Tracking System) evaluator.

Evaluate the following parsed resume data and produce a standalone quality assessment.
You are NOT matching against a specific job description — you are scoring the resume's
overall quality, completeness, and marketability.

PARSED RESUME DATA:
{resume_json}

SCORING CRITERIA (score each 0-100):

1. **skill_completeness** (0-100):
   - Breadth and depth of technical/professional skills listed
   - Relevance to current industry demands
   - Mix of hard and soft skills
   - Score 80+ for comprehensive, well-categorized skill sets
   - Score 40-60 for sparse or generic skill lists

2. **experience_score** (0-100):
   - Number and quality of work experience entries
   - Progression in roles (junior → senior)
   - Specificity of responsibilities and achievements
   - Score 80+ for 3+ years with clear progression
   - Score 40-60 for limited or vague experience

3. **education_score** (0-100):
   - Relevance and level of educational qualifications
   - Reputable institutions
   - Score 80+ for relevant degree from recognized institution
   - Score 40-60 for unrelated or missing education details

4. **resume_quality** (0-100):
   - Overall presentation and structure quality
   - Completeness of contact information
   - Presence of projects/portfolio
   - Quantified achievements vs vague statements
   - Score 80+ for well-structured resumes with measurable impact
   - Score 40-60 for basic or poorly organized resumes

5. **overall_score** (0-100):
   - Weighted aggregate: skills(30%) + experience(30%) + education(15%) + quality(25%)
   - Apply your professional judgment to adjust ±5 points

RESPOND WITH ONLY valid JSON, no markdown fences, no explanation:
{{
  "overall_score": <int>,
  "skill_completeness": <int>,
  "experience_score": <int>,
  "education_score": <int>,
  "resume_quality": <int>
}}"""
)
