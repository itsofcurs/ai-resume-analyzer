import os
from typing import Any, Dict, List

import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Use gemini-1.5-flash for speed or gemini-1.5-pro for complex reasoning
# We'll use flash by default for lower latency unless pro is needed
model = genai.GenerativeModel("gemini-1.5-flash")


async def generate_candidate_summary(resume_data: Dict[str, Any]) -> str:
    prompt = f"""
    You are an expert technical recruiter. Based on the following candidate extracted data,
    provide a concise, professional 3-sentence summary of the candidate's core strengths,
    years of experience, and best-fit roles.
    
    Candidate Data:
    {resume_data}
    """
    response = await model.generate_content_async(prompt)
    return response.text


async def analyze_job_fit(
    resume_data: Dict[str, Any], job_description: str
) -> Dict[str, Any]:
    prompt = f"""
    You are an AI recruitment copilot. Analyze the candidate's fit for the job description.
    Return ONLY a valid JSON object with the following keys:
    - "fit_score": integer (0-100)
    - "matched_skills": list of strings
    - "missing_skills": list of strings
    - "strengths": list of strings (max 3)
    - "weaknesses": list of strings (max 3)
    - "recommendation": string (short paragraph)
    
    Job Description:
    {job_description}
    
    Candidate Data:
    {resume_data}
    """
    response = await model.generate_content_async(prompt)
    import json

    try:
        text = response.text.replace("```json", "").replace("```", "").strip()
        return json.loads(text)
    except Exception:
        return {"fit_score": 0, "error": "AI generation failed to parse."}


async def generate_interview_questions(
    resume_data: Dict[str, Any], job_description: str
) -> List[str]:
    prompt = f"""
    Generate 5 highly tailored technical and behavioral interview questions for this candidate,
    specifically probing their weaknesses or gaps compared to the job description.
    
    Job Description: {job_description}
    Candidate Data: {resume_data}
    
    Return ONLY a JSON list of strings.
    """
    response = await model.generate_content_async(prompt)
    import json

    try:
        text = response.text.replace("```json", "").replace("```", "").strip()
        return json.loads(text)
    except Exception:
        return ["Could not generate questions."]


async def detect_fraud(resume_data: Dict[str, Any], raw_text: str) -> Dict[str, Any]:
    prompt = f"""
    You are an AI fraud detection system for an ATS. Analyze this resume for signs of:
    - Suspicious keyword stuffing (white text or excessive repetition)
    - Unrealistic experience timelines (e.g. 10 years of React when it didn't exist)
    - AI-generated boilerplate phrasing that feels generic
    
    Return ONLY a valid JSON object with:
    - "confidence_score": integer 0-100 (100 means high confidence it is authentic, 0 means high confidence it is fake)
    - "flags": list of strings (reasons for suspicion)
    
    Resume Text:
    {raw_text[:3000]}...
    """
    response = await model.generate_content_async(prompt)
    import json

    try:
        text = response.text.replace("```json", "").replace("```", "").strip()
        return json.loads(text)
    except Exception:
        return {"confidence_score": 100, "flags": []}
