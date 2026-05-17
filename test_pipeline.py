"""Quick smoke test for the NLP pipeline."""
import sys
import fitz  # noqa: F401
import flask  # noqa: F401
import spacy  # noqa: F401

from backend.nlp_pipeline import process_resume
from utils.file_parser import extract_text
from utils.data_formatter import to_json

def run_test(filepath, filename):
    with open(filepath, "rb") as f:
        raw = extract_text(filename, f.read())
    result = process_resume(raw)
    print(f"\n{'='*50}")
    print(f"FILE   : {filename}")
    print(f"Name   : {result['name']}")
    print(f"Email  : {result['email']}")
    print(f"Phone  : {result['phone']}")
    print(f"Skills : {len(result['skills'])} found — {[s['skill'] for s in result['skills'][:8]]}")
    print(f"Edu    : {len(result['education'])} entries")
    print(f"Exp    : {len(result['experience'])} entries")
    print(f"Words  : {result['word_count']}")

if __name__ == "__main__":
    print("=== SMOKE TEST: NLP Pipeline ===")
    samples = [
        ("sample_resumes/sample1_john_doe.txt",  "sample1_john_doe.txt"),
        ("sample_resumes/sample2_priya_sharma.txt", "sample2_priya_sharma.txt"),
        ("sample_resumes/sample3_rahul_verma.txt",  "sample3_rahul_verma.txt"),
    ]
    for path, name in samples:
        try:
            run_test(path, name)
        except Exception as e:
            print(f"ERROR on {name}: {e}")
    print("\n=== ALL DONE ===")
    sys.exit(0)
