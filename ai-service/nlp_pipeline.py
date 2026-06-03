"""
nlp_pipeline.py
----------------
LEGACY NLP pipeline module — preserved for full backward compatibility.

This module continues to own:
  - download_and_extract_text()  → Cloudinary download + PyMuPDF / text decode
  - analyze_resume_unified()     → direct Gemini SDK call (legacy path)
  - extract_basic_info()         → thin wrapper (legacy compatibility)
  - analyze_authenticity()       → thin wrapper (legacy compatibility)

As of v2.0.0, the primary processing path routes through:
  workflows/resume_workflow.py → agents/resume_parser.py → services/gemini_service.py

This file is retained as a fallback and for any direct callers that have
not yet migrated to the new workflow layer.
"""

import io
import re
import spacy
import fitz  # PyMuPDF
import requests
import logging
import os
import json
import google.generativeai as genai

# Shared text utilities — single source of truth for text processing
from utils.parser_utils import sanitize_name, truncate_text, clean_json_str

logger = logging.getLogger(__name__)

try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    logger.warning("spacy en_core_web_sm not found, using blank en model")
    nlp = spacy.blank("en")

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

def download_and_extract_text(url: str, filename: str) -> str:
    """Download file from Cloudinary and extract raw text."""
    try:
        response = requests.get(url)
        response.raise_for_status()
        
        file_bytes = response.content
        ext = filename.split('.')[-1].lower() if '.' in filename else ''
        
        text = ""
        if ext == 'pdf':
            with fitz.open("pdf", file_bytes) as doc:
                for page in doc:
                    text += page.get_text("text") + "\n"
        elif ext in ['txt', 'md']:
            text = file_bytes.decode('utf-8', errors='ignore')
        else:
            text = file_bytes.decode('utf-8', errors='ignore')
            
        return text
    except Exception as e:
        logger.error(f"Error downloading or extracting text: {e}")
        return ""

def analyze_resume_unified(text: str) -> dict:
    """Uses Gemini 2.5-flash to extract details and perform balanced authenticity/AI analysis in a single call."""
    if not api_key:
        return {
            "name": "Unknown Candidate",
            "email": "",
            "phone": "",
            "skills": [],
            "authenticity_score": 100,
            "ai_generated_probability": 0,
            "red_flags": ["API key missing"],
            "technical_depth_score": 100
        }
        
    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"""
        You are an expert technical recruiter and HR auditor. Analyze this resume text to extract candidate details and perform an authenticity/AI generation audit.

        STRICT INSTRUCTIONS:
        1. Extract the candidate's actual first and last Name (usually found at the top, e.g. "Shardul Dhanokar"). Never extract technical terms, skills, or programming languages (like "Redis", "Machine Learning", "Node.js", "Java", "Docker") as the candidate's name. If no valid candidate name is found, use "Unknown Candidate".
        2. Extract the Email address.
        3. Extract the Phone number.
        4. Extract a clean list of technical skills mentioned (e.g. react, node, sql, python, aws, c++).
        5. Evaluate Candidate Authenticity and AI Likelihood realistically:
           - Do not give extremely low scores (like < 70) for typical, standard developer resumes just because they list technical skills. Standard professional resumes are highly authentic.
           - Only assign low Authenticity Scores (below 70) if you detect clear evidence of fraud, illogical employment date overlaps (e.g., working 2 full-time onsite roles in different states simultaneously), copy-pasting of identical job specifications, or massive repeating of irrelevant keyword stuffing.
           - Only set high AI Likelihood if the text is entirely a copy-paste AI template lacking specific company names or project context.
           - If the resume is clean and standard, return an empty array [] for red_flags. Never invent red flags.

        Return ONLY a valid JSON object matching this exact structure:
        {{
            "name": "Candidate Name",
            "email": "email@example.com",
            "phone": "+1234567890",
            "skills": ["react", "typescript", "node"],
            "authenticity_score": 80-100,
            "ai_generated_probability": 0-100,
            "red_flags": ["list", "of", "findings"],
            "technical_depth_score": 0-100
        }}

        Resume text:
        {truncate_text(text)}
        """
        response = model.generate_content(prompt)
        # Use shared utility to strip markdown fences reliably
        response_text = clean_json_str(response.text)
        parsed = json.loads(response_text)
        
        # Use shared sanitize_name utility — single source of truth for name validation
        parsed["name"] = sanitize_name(parsed.get("name", ""))

        return parsed
    except Exception as e:
        logger.error(f"Unified analysis failed: {e}")
        return {
            "name": "Unknown Candidate",
            "email": "",
            "phone": "",
            "skills": [],
            "authenticity_score": 90,
            "ai_generated_probability": 10,
            "red_flags": [],
            "technical_depth_score": 80
        }

def extract_basic_info(text: str) -> dict:
    """Preserved wrapper calling the unified analysis to extract basic info."""
    data = analyze_resume_unified(text)
    return {
        "name": data.get("name", "Unknown Candidate"),
        "email": data.get("email", ""),
        "phone": data.get("phone", ""),
        "skills": data.get("skills", [])
    }

def analyze_authenticity(text: str) -> dict:
    """Preserved wrapper calling the unified analysis to get authenticity results."""
    data = analyze_resume_unified(text)
    return {
        "authenticity_score": data.get("authenticity_score", 90),
        "ai_generated_probability": data.get("ai_generated_probability", 10),
        "red_flags": data.get("red_flags", []),
        "technical_depth_score": data.get("technical_depth_score", 80)
    }
