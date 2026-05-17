import sys
import json
import os
import traceback

# Add parent dir to python path to import existing backend
parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, parent_dir)

from backend.nlp_pipeline import process_resume
from utils.file_parser import extract_text

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)
        
    file_path = sys.argv[1]
    
    try:
        with open(file_path, "rb") as f:
            file_bytes = f.read()
            
        raw_text = extract_text(file_path, file_bytes)
        
        if not raw_text.strip():
            print(json.dumps({"error": "Could not extract text", "rawText": ""}))
            sys.exit(0)
            
        extracted_data = process_resume(raw_text)
        
        result = {
            "parsedData": extracted_data,
            "rawText": raw_text
        }
        
        # Print JSON strictly
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
        sys.exit(1)

if __name__ == "__main__":
    main()
