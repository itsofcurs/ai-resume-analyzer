"""
Smart Resume Skill Extractor - Flask Application
=================================================
Main entry point for the backend API.

Routes:
  GET  /                        → Serve main UI
  POST /api/upload              → Upload & process resumes
  POST /api/rank                → Rank candidates by skills
  GET  /api/download/json/<id>  → Download result as JSON
  GET  /api/download/csv        → Download all results as CSV
  GET  /api/health              → Health check
"""

import os
import uuid
import json
import logging
import traceback
from datetime import datetime
from typing import Dict, Any

from flask import (
    Flask, request, jsonify, render_template,
    send_file, make_response, session
)
from werkzeug.utils import secure_filename
import io

from backend.nlp_pipeline import process_resume
from utils.file_parser import extract_text
from utils.data_formatter import (
    to_json, to_csv_single, to_csv_multiple, rank_candidates
)

# ---------------------------------------------------------------------------
# App Configuration
# ---------------------------------------------------------------------------
app = Flask(
    __name__,
    template_folder="templates",
    static_folder="static",
)
app.secret_key = os.environ.get("SECRET_KEY", "nlp-resume-extractor-2024-secret")

# Upload settings
UPLOAD_FOLDER = os.path.join("static", "uploads")
ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "txt"}
MAX_FILE_SIZE_MB = 10
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE_MB * 1024 * 1024
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# In-memory store for session results (keyed by session_id → list of results)
RESULTS_STORE: Dict[str, Any] = {}

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def allowed_file(filename: str) -> bool:
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


def get_session_id() -> str:
    """Get or create a unique session ID."""
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())
    return session["session_id"]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    """Serve the main frontend UI."""
    return render_template("index.html")


@app.route("/api/health")
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
    })


@app.route("/api/upload", methods=["POST"])
def upload_resumes():
    """
    Upload one or more resume files and process them through the NLP pipeline.

    Accepts: multipart/form-data with field 'resumes'
    Returns: JSON with extracted data for each resume
    """
    if "resumes" not in request.files:
        return jsonify({"error": "No files provided. Use field name 'resumes'."}), 400

    files = request.files.getlist("resumes")
    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No files selected."}), 400

    session_id = get_session_id()
    results = []
    errors = []

    for file in files:
        if not file or file.filename == "":
            continue

        filename = secure_filename(file.filename)

        if not allowed_file(filename):
            errors.append({
                "filename": filename,
                "error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            })
            continue

        try:
            # Read file bytes
            file_bytes = file.read()

            # Extract raw text
            logger.info(f"Extracting text from: {filename}")
            raw_text = extract_text(filename, file_bytes)

            if not raw_text.strip():
                errors.append({"filename": filename, "error": "Could not extract text from file."})
                continue

            # Run NLP pipeline
            logger.info(f"Running NLP pipeline on: {filename}")
            extracted = process_resume(raw_text)

            result = {
                "id": str(uuid.uuid4()),
                "filename": filename,
                "file_size_kb": round(len(file_bytes) / 1024, 1),
                "processed_at": datetime.utcnow().isoformat(),
                "data": extracted,
                "raw_text_preview": raw_text[:500],  # first 500 chars for UI preview
            }
            results.append(result)
            logger.info(f"Successfully processed: {filename}")

        except Exception as e:
            logger.error(f"Error processing {filename}: {traceback.format_exc()}")
            errors.append({"filename": filename, "error": str(e)})

    # Store in memory for later download
    RESULTS_STORE[session_id] = results

    return jsonify({
        "session_id": session_id,
        "processed": len(results),
        "failed": len(errors),
        "results": results,
        "errors": errors,
    })


@app.route("/api/rank", methods=["POST"])
def rank():
    """
    Rank processed candidates based on required skills.

    Body: { "session_id": "...", "required_skills": ["python", "react", ...] }
    Returns: Ranked list of candidates with match scores.
    """
    body = request.get_json(silent=True) or {}
    session_id = body.get("session_id") or get_session_id()
    required_skills = body.get("required_skills", [])

    if not required_skills:
        return jsonify({"error": "Provide 'required_skills' as a list."}), 400

    stored_results = RESULTS_STORE.get(session_id, [])
    if not stored_results:
        return jsonify({"error": "No processed resumes found for this session."}), 404

    ranked = rank_candidates(stored_results, required_skills)
    return jsonify({
        "required_skills": required_skills,
        "ranked_candidates": ranked,
        "total": len(ranked),
    })


@app.route("/api/download/json/<result_id>", methods=["GET"])
def download_json(result_id: str):
    """Download a single resume's extracted data as JSON."""
    session_id = request.args.get("session_id") or get_session_id()
    stored_results = RESULTS_STORE.get(session_id, [])

    target = next((r for r in stored_results if r["id"] == result_id), None)
    if not target:
        return jsonify({"error": "Result not found."}), 404

    json_str = to_json(target["data"])
    filename = target["filename"].rsplit(".", 1)[0] + "_extracted.json"

    response = make_response(json_str)
    response.headers["Content-Type"] = "application/json"
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


@app.route("/api/download/json-all", methods=["GET"])
def download_all_json():
    """Download all resumes' extracted data as a combined JSON file."""
    session_id = request.args.get("session_id") or get_session_id()
    stored_results = RESULTS_STORE.get(session_id, [])

    if not stored_results:
        return jsonify({"error": "No results found."}), 404

    export_data = []
    for r in stored_results:
        export_data.append({
            "filename": r["filename"],
            "processed_at": r["processed_at"],
            "data": json.loads(to_json(r["data"])),
        })

    json_str = json.dumps(export_data, indent=2, ensure_ascii=False)
    response = make_response(json_str)
    response.headers["Content-Type"] = "application/json"
    response.headers["Content-Disposition"] = "attachment; filename=all_resumes_extracted.json"
    return response


@app.route("/api/download/csv", methods=["GET"])
def download_csv():
    """Download all resumes as comparative CSV."""
    session_id = request.args.get("session_id") or get_session_id()
    stored_results = RESULTS_STORE.get(session_id, [])

    if not stored_results:
        return jsonify({"error": "No results found."}), 404

    csv_str = to_csv_multiple(stored_results)
    response = make_response(csv_str)
    response.headers["Content-Type"] = "text/csv"
    response.headers["Content-Disposition"] = "attachment; filename=resume_comparison.csv"
    return response


@app.route("/api/download/csv/<result_id>", methods=["GET"])
def download_csv_single(result_id: str):
    """Download a single resume's extracted data as CSV."""
    session_id = request.args.get("session_id") or get_session_id()
    stored_results = RESULTS_STORE.get(session_id, [])

    target = next((r for r in stored_results if r["id"] == result_id), None)
    if not target:
        return jsonify({"error": "Result not found."}), 404

    csv_str = to_csv_single(target["data"])
    filename = target["filename"].rsplit(".", 1)[0] + "_extracted.csv"

    response = make_response(csv_str)
    response.headers["Content-Type"] = "text/csv"
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


@app.route("/api/results", methods=["GET"])
def get_results():
    """Get all stored results for the current session."""
    session_id = request.args.get("session_id") or get_session_id()
    stored_results = RESULTS_STORE.get(session_id, [])
    return jsonify({
        "session_id": session_id,
        "count": len(stored_results),
        "results": stored_results,
    })


# ---------------------------------------------------------------------------
# Error Handlers
# ---------------------------------------------------------------------------

@app.errorhandler(413)
def file_too_large(e):
    return jsonify({"error": f"File too large. Max size: {MAX_FILE_SIZE_MB}MB"}), 413


@app.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "Internal server error.", "detail": str(e)}), 500


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print("  Smart Resume Skill Extractor")
    print("  Running at: http://127.0.0.1:5000")
    print("=" * 60)
    app.run(debug=True, host="127.0.0.1", port=5000)
