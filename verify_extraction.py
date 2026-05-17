"""Detailed verification of education and experience extraction."""
from utils.file_parser import extract_text
from backend.nlp_pipeline import process_resume

samples = [
    ("sample_resumes/sample1_john_doe.txt",     "sample1_john_doe.txt"),
    ("sample_resumes/sample2_priya_sharma.txt",  "sample2_priya_sharma.txt"),
    ("sample_resumes/sample3_rahul_verma.txt",   "sample3_rahul_verma.txt"),
]

for path, name in samples:
    with open(path, "rb") as f:
        raw = extract_text(name, f.read())
    r = process_resume(raw)

    print(f"\n{'='*55}")
    print(f"FILE: {name}")

    print("\n  EDUCATION:")
    for e in r["education"]:
        print(f"    Degree : {e['degree']}")
        print(f"    Inst   : {e['institution']}")
        print(f"    Year   : {e['year']}")
        print()

    print("  EXPERIENCE:")
    for e in r["experience"]:
        print(f"    Role     : {e['role']}")
        print(f"    Company  : {e['company']}")
        print(f"    Duration : {e['duration']}")
        print()
