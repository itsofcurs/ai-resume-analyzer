# 🧠 Smart Resume Skill Extractor for Recruiters

> An NLP-powered system that extracts structured information from resumes using spaCy, NLTK, and Named Entity Recognition — built for the Natural Language Processing (PBL) course.

---

## 🚀 Live Features

| Feature | Description |
|---|---|
| **Multi-File Upload** | Upload PDF, DOCX, TXT resumes (drag & drop supported) |
| **Text Extraction** | PyMuPDF (PDF), python-docx (DOCX), native (TXT) |
| **NLP Preprocessing** | Tokenization, lowercasing, stopword removal (NLTK) |
| **POS Tagging** | Part-of-speech tagging via spaCy |
| **Named Entity Recognition** | Detects PERSON, ORG, GPE, DATE entities |
| **Skill Extraction** | 500+ skills matched via spaCy PhraseMatcher + regex |
| **Info Extraction** | Name, email, phone, LinkedIn, GitHub, education, experience |
| **Candidate Ranking** | Rank candidates by required skill match % |
| **Skill Analytics** | Charts: frequency, distribution, per-candidate |
| **Multi-Resume Compare** | Side-by-side comparison of all uploaded resumes |
| **Download Results** | Export as JSON or CSV (per-resume or all) |

---

## 📁 Project Structure

```
NLP-PBL/
├── app.py                          # Flask application (API routes)
├── requirements.txt                # Python dependencies
├── README.md                       # Documentation
│
├── backend/
│   ├── __init__.py
│   ├── nlp_pipeline.py             # 🧠 Core NLP pipeline (main logic)
│   └── skill_dictionary.py         # 500+ categorized skills dictionary
│
├── utils/
│   ├── __init__.py
│   ├── file_parser.py              # PDF/DOCX/TXT text extraction
│   └── data_formatter.py           # JSON/CSV export + candidate ranking
│
├── models/
│   └── __init__.py
│
├── templates/
│   └── index.html                  # Frontend UI (Bootstrap + Chart.js)
│
├── static/
│   └── uploads/                    # Uploaded resume files (auto-created)
│
└── sample_resumes/
    ├── sample1_john_doe.txt         # Software Engineer (ML background)
    ├── sample2_priya_sharma.txt     # Data Scientist (NLP expertise)
    └── sample3_rahul_verma.txt      # Full-Stack Developer
```

---

## ⚙️ Setup Instructions

### Prerequisites
- Python 3.9+ 
- pip

### Step 1: Create Virtual Environment (Recommended)

```bash
python -m venv venv
# Activate on Windows:
venv\Scripts\activate
# Activate on macOS/Linux:
source venv/bin/activate
```

### Step 2: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 3: Download spaCy Language Model

```bash
python -m spacy download en_core_web_sm
```

### Step 4: Download NLTK Data

```bash
python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab'); nltk.download('stopwords')"
```

### Step 5: Run the Application

```bash
python app.py
```

Open your browser and go to: **http://127.0.0.1:5000**

---

## 🧪 Testing with Sample Resumes

Three sample resumes are provided in the `sample_resumes/` folder:

| File | Candidate | Profile |
|---|---|---|
| `sample1_john_doe.txt` | John Doe | Senior Software Engineer @ Google |
| `sample2_priya_sharma.txt` | Priya Sharma | Data Scientist @ Amazon |
| `sample3_rahul_verma.txt` | Rahul Verma | Full-Stack Developer @ Zoho |

Upload them via the UI to see the extraction in action.

---

## 🧠 NLP Pipeline Details

```
Input Resume (PDF/DOCX/TXT)
         │
         ▼
┌─────────────────────────────┐
│   1. TEXT EXTRACTION        │  PyMuPDF, python-docx, UTF-8 decode
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│   2. PREPROCESSING          │  Tokenization, lowercase, stopword removal (NLTK)
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│   3. POS TAGGING            │  spaCy en_core_web_sm
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│   4. NAMED ENTITY RECOG.    │  spaCy NER → PERSON, ORG, GPE, DATE
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│   5. SKILL EXTRACTION       │  spaCy PhraseMatcher + Regex  
│                             │  500+ skills across 11 categories
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│   6. INFO EXTRACTION        │  Regex + NER for email, phone,
│                             │  education, experience, links
└─────────────────────────────┘
         │
         ▼
   Structured JSON Output
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serve frontend UI |
| `POST` | `/api/upload` | Upload & process resumes |
| `POST` | `/api/rank` | Rank candidates by required skills |
| `GET` | `/api/download/json/<id>` | Download single result as JSON |
| `GET` | `/api/download/json-all` | Download all results as JSON |
| `GET` | `/api/download/csv` | Download all results as CSV |
| `GET` | `/api/download/csv/<id>` | Download single result as CSV |
| `GET` | `/api/health` | Health check |

### Example: Upload Resume

```bash
curl -X POST http://localhost:5000/api/upload \
  -F "resumes=@sample_resumes/sample1_john_doe.txt"
```

### Example: Rank Candidates

```bash
curl -X POST http://localhost:5000/api/rank \
  -H "Content-Type: application/json" \
  -d '{"session_id": "YOUR_SESSION_ID", "required_skills": ["python", "react", "docker"]}'
```

### Example Output (JSON)

```json
{
  "name": "John Doe",
  "email": "johndoe@email.com",
  "phone": "+91-9876543210",
  "linkedin": "https://linkedin.com/in/johndoe",
  "github": "https://github.com/johndoe",
  "skills": ["python", "java", "react", "docker", "tensorflow", "spacy", ...],
  "skill_categories": {
    "Programming Languages": ["python", "java"],
    "Web Technologies": ["react", "node.js", "flask"],
    "Cloud & DevOps": ["aws", "docker", "kubernetes"],
    "Data Science & ML": ["tensorflow", "scikit-learn", "nlp"]
  },
  "education": [
    {
      "degree": "B.Tech in Computer Science and Engineering",
      "institution": "Indian Institute of Technology, Bombay",
      "year": "2016 - 2020"
    }
  ],
  "experience": [
    {
      "role": "Senior Software Engineer",
      "company": "Google India Pvt. Ltd.",
      "duration": "July 2022 - Present"
    }
  ]
}
```

---

## 📦 Dependencies

| Library | Purpose |
|---|---|
| `flask` | Web framework & API |
| `spacy` | NLP (POS, NER, PhraseMatcher) |
| `nltk` | Tokenization, stopwords |
| `pymupdf` | PDF text extraction |
| `pdfplumber` | PDF text extraction (fallback) |
| `python-docx` | DOCX text extraction |
| `pandas` | Data processing |

---

## 🎨 Tech Stack

- **Backend**: Python, Flask
- **NLP**: spaCy (`en_core_web_sm`), NLTK
- **Frontend**: HTML5, CSS3, JavaScript, Bootstrap 5
- **Charts**: Chart.js
- **File Parsing**: PyMuPDF, python-docx

---

## 👨‍💻 Author

**NLP Project-Based Learning (PBL)**  
Natural Language Processing Course  
Academic Year 2024–25

---

## 📝 License

MIT License — Free to use for educational purposes.
