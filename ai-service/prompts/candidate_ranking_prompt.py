"""
prompts/candidate_ranking_prompt.py
------------------------------------
Candidate ranking prompt — grades and classifies candidates based on
their parsed resume data and ATS scores.

Used by the LangGraph pipeline to produce a hiring recommendation
at upload time.
"""

from langchain_core.prompts import PromptTemplate

PROMPT_VERSION = "1.0.0"

CANDIDATE_RANKING_PROMPT = PromptTemplate.from_template(
    """You are a senior talent acquisition specialist and hiring committee member.

Based on the following candidate data and their ATS scores, produce a candidate
classification and hiring recommendation.

PARSED RESUME DATA:
{resume_json}

ATS SCORES:
{ats_scores_json}

GRADING CRITERIA:

**Grade** (letter grade):
- A+ : Exceptional candidate, top 5% — outstanding skills, experience, and presentation
- A  : Excellent candidate, top 15% — strong all-around profile
- B+ : Very good candidate — solid skills with some standout qualities
- B  : Good candidate — meets expectations with room for growth
- C+ : Above average — decent profile but notable gaps
- C  : Average candidate — meets minimum requirements
- D  : Below average — significant gaps in skills or experience
- F  : Poor fit — missing critical qualifications

**Tier** (one of: Exceptional, Strong, Moderate, Developing, Weak):
- Exceptional: A+ or A grade with ATS overall >= 85
- Strong: A or B+ grade with ATS overall >= 70
- Moderate: B or C+ grade with ATS overall >= 55
- Developing: C or D grade with ATS overall >= 40
- Weak: D or F grade with ATS overall < 40

**Hiring Priority** (one of: Critical, High, Medium, Low, Do Not Hire):
- Critical: Immediate hire — exceptional match, rare skill set
- High: Strong candidate — prioritize for interview pipeline
- Medium: Solid candidate — schedule for standard process
- Low: Marginal candidate — consider if pipeline is thin
- Do Not Hire: Does not meet minimum qualifications

**Recruiter Recommendation**: Write 1-2 sentences of actionable advice for the recruiter.
Focus on: interview readiness, specific strengths to probe, or concerns to address.

RESPOND WITH ONLY valid JSON, no markdown fences, no explanation:
{{
  "grade": "<letter>",
  "tier": "<tier>",
  "hiring_priority": "<priority>",
  "recruiter_recommendation": "<recommendation text>"
}}"""
)
