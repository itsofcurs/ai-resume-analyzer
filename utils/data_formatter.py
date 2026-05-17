"""
Data Formatter Utility
=======================
Converts extracted resume data into JSON and CSV formats for download.
"""

import csv
import json
import io
from typing import Dict, Any, List


def to_json(data: Dict[str, Any], indent: int = 2) -> str:
    """Serialize extracted resume data to a formatted JSON string."""
    # Make a clean exportable copy (remove internal doc objects)
    exportable = {
        "name": data.get("name", ""),
        "email": data.get("email", ""),
        "phone": data.get("phone", ""),
        "linkedin": data.get("linkedin", ""),
        "github": data.get("github", ""),
        "summary": data.get("summary", ""),
        "skills": [s["skill"] for s in data.get("skills", [])],
        "skill_categories": data.get("skill_categories", {}),
        "education": data.get("education", []),
        "experience": data.get("experience", []),
        "stats": {
            "word_count": data.get("word_count", 0),
            "sentence_count": data.get("sentence_count", 0),
            "total_skills_found": len(data.get("skills", [])),
        },
    }
    return json.dumps(exportable, indent=indent, ensure_ascii=False)


def to_csv_single(data: Dict[str, Any]) -> str:
    """
    Convert a single resume's extracted data to CSV string.
    Skills are comma-separated in one cell.
    Education and experience are flattened.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["Field", "Value"])
    writer.writerow(["Name", data.get("name", "")])
    writer.writerow(["Email", data.get("email", "")])
    writer.writerow(["Phone", data.get("phone", "")])
    writer.writerow(["LinkedIn", data.get("linkedin", "")])
    writer.writerow(["GitHub", data.get("github", "")])
    writer.writerow(["Summary", data.get("summary", "")])

    # Skills
    skills_list = [s["skill"] for s in data.get("skills", [])]
    writer.writerow(["Skills", "; ".join(skills_list)])

    # Education
    for i, edu in enumerate(data.get("education", []), start=1):
        writer.writerow([
            f"Education {i}",
            f"{edu.get('degree', '')} | {edu.get('institution', '')} | {edu.get('year', '')}",
        ])

    # Experience
    for i, exp in enumerate(data.get("experience", []), start=1):
        writer.writerow([
            f"Experience {i}",
            f"{exp.get('role', '')} at {exp.get('company', '')} ({exp.get('duration', '')})",
        ])

    writer.writerow(["Word Count", data.get("word_count", 0)])
    writer.writerow(["Total Skills Found", len(data.get("skills", []))])

    return output.getvalue()


def to_csv_multiple(results: List[Dict[str, Any]]) -> str:
    """
    Convert multiple resumes to a comparative CSV format.
    Each row = one candidate.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "Filename", "Name", "Email", "Phone",
        "Total Skills", "Top Skills",
        "Education", "Experience Companies",
        "Word Count",
    ])

    for result in results:
        data = result.get("data", {})
        filename = result.get("filename", "Unknown")

        skills_list = [s["skill"] for s in data.get("skills", [])]
        top_skills = "; ".join(skills_list[:10])

        edu_list = data.get("education", [])
        edu_str = " | ".join(
            f"{e.get('degree', '')} {e.get('institution', '')}" for e in edu_list
        )

        exp_list = data.get("experience", [])
        exp_str = " | ".join(e.get("company", "") for e in exp_list if e.get("company"))

        writer.writerow([
            filename,
            data.get("name", ""),
            data.get("email", ""),
            data.get("phone", ""),
            len(skills_list),
            top_skills,
            edu_str,
            exp_str,
            data.get("word_count", 0),
        ])

    return output.getvalue()


def rank_candidates(
    results: List[Dict[str, Any]],
    required_skills: List[str],
) -> List[Dict[str, Any]]:
    """
    Rank candidates by how many required skills they possess.
    Returns sorted list with match_score and matched_skills added.
    """
    required_lower = [s.lower().strip() for s in required_skills if s.strip()]

    ranked = []
    for result in results:
        data = result.get("data", {})
        candidate_skills = [s["skill"].lower() for s in data.get("skills", [])]
        matched = [s for s in required_lower if s in candidate_skills]
        score = (len(matched) / len(required_lower) * 100) if required_lower else 0

        ranked.append({
            **result,
            "match_score": round(score, 1),
            "matched_skills": matched,
            "missing_skills": [s for s in required_lower if s not in candidate_skills],
        })

    ranked.sort(key=lambda x: x["match_score"], reverse=True)
    return ranked
