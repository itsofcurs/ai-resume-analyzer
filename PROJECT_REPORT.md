# VISHWAKARMA INSTITUTE OF INFORMATION TECHNOLOGY, PUNE
## Department of Artificial Intelligence and Data Science

# PROJECT REPORT
## Generative AI - Academic Year 2024-25

## Smart Resume Skill Extractor for Recruiters
### NLP-Powered Resume Intelligence and Candidate Ranking System

**Under Guidance**  
Dr. Amar Buchade

## PRESENTED BY

| Name | Roll Number | PRN Number |
|---|---:|---:|
| Shardul Dhanokar | 373014 | 22310242 |
| Ayush Patil | 373039 | 22310343 |
| Suyog Tekam | 373004 | 22310064 |
| Rohan Jadhav | 373035 | 22311084 |

---

## ABSTRACT
Traditional resume screening is time-consuming, inconsistent, and difficult to scale, especially when recruiters must evaluate large candidate pools across diverse job roles. Manual shortlisting often introduces delay, subjective bias, and missed talent due to unstructured resume formats.  
This project presents Smart Resume Skill Extractor for Recruiters, an NLP-driven system that transforms raw resumes into structured candidate intelligence. The platform supports multi-file upload of PDF, DOCX, and TXT resumes and processes each document through an end-to-end extraction pipeline: text extraction, preprocessing, POS tagging, named entity recognition, skill matching, profile structuring, and candidate ranking.  
The system is implemented using Python and Flask at the backend, with spaCy and NLTK powering language analysis. A skill dictionary of 500+ mapped skills enables category-wise talent profiling across domains such as Programming, Web, Databases, Cloud and DevOps, Data Science and ML, Testing, Security, Soft Skills, and Tools.  
Beyond extraction, the system includes recruiter-oriented utilities: candidate ranking based on required skills, analytics charts for skill trends, side-by-side candidate comparison, and downloadable outputs in JSON and CSV formats.  
The solution demonstrates both technical robustness and practical usability for recruitment workflows, serving as a strong foundation for future enhancements such as persistent database storage, role-specific scoring models, and explainable hiring insights.

---

## KEYWORDS
Natural Language Processing, Resume Parsing, Named Entity Recognition, Skill Extraction, Candidate Ranking, Information Extraction, spaCy, NLTK, Flask, Recruitment Analytics, Text Mining, AI-assisted Hiring

---

## THE PROBLEM AND THE VISION

| THE PROBLEM | THE VISION |
|---|---|
| Recruiters spend significant effort manually reading unstructured resumes and mapping candidate skills to job requirements. | Build an intelligent resume intelligence assistant that converts raw resumes into structured, searchable, rankable candidate profiles. |
| Resume formats vary heavily, causing inconsistency in identification of key fields like skills, education, and experience. | Create a robust pipeline that handles multiple file types and extracts standardized profile components with transparent logic. |
| Early-stage shortlisting often lacks objective scoring and comparative analytics. | Provide data-driven ranking, category-wise analytics, and side-by-side candidate comparison for faster, fairer decisions. |
| Teams need downloadable outputs for sharing, reporting, and ATS preprocessing. | Enable one-click JSON/CSV export for individual and multi-candidate results. |

---

## PROJECT OBJECTIVES
1. Build a multi-format resume ingestion system supporting PDF, DOCX/DOC, and TXT.
2. Implement an NLP pipeline for preprocessing, POS tagging, NER, and skill extraction.
3. Extract structured candidate attributes including contact info, education, experience, summary, and categorized skills.
4. Design a recruiter-facing dashboard for visual analysis and candidate comparison.
5. Implement skill-based candidate ranking with match score, matched skills, and missing skills.
6. Provide downloadable structured outputs for operational use.
7. Ensure modular architecture for future extension into production-grade recruitment systems.

---

## LEVERAGING GENERATIVE AI AND AI CONCEPTS (ADAPTED TO THIS PROJECT)

| Concept Area | Application in This Project |
|---|---|
| NLP Preprocessing | Tokenization, stopword removal, and normalization for consistent downstream extraction. |
| Information Extraction | Regex plus entity extraction to capture name, email, phone, social links, education, and experience. |
| Named Entity Recognition | spaCy-based extraction of entities such as PERSON, ORG, GPE, and DATE for profile intelligence. |
| Skill Intelligence | PhraseMatcher and curated dictionary mapping to detect and categorize technical and soft skills. |
| Explainability | Transparent output fields, category tags, and visible extracted entities for traceable decision support. |
| Human-in-the-loop Readiness | Ranked outputs and structured exports allow recruiter validation before final decisions. |

Note: This implementation does not use large language model agent workflows, RAG pipelines, or model fine-tuning. It focuses on deterministic and interpretable NLP extraction suitable for academic and practical recruitment use cases.

---

## SYSTEM OVERVIEW AND ARCHITECTURE

### End-to-End Flow
1. User uploads one or multiple resumes from the web dashboard.
2. Backend validates file type and size constraints.
3. Raw text is extracted depending on document format.
4. NLP pipeline processes text for linguistic and semantic signals.
5. Structured candidate profile is generated.
6. Profiles are shown in dashboard tabs: candidates, ranking, analytics, comparison, NLP details.
7. Recruiter can rank by required skills and export results.

[DIAGRAM: End-to-end system flow with stages: Upload Interface -> Flask API -> Text Extractor -> NLP Pipeline -> Structured Profile Builder -> Ranking Engine -> Visualization and Export Layer]

### Architecture Layers

| Layer | Components | Responsibility |
|---|---|---|
| Presentation Layer | HTML/CSS/JavaScript, Bootstrap, Chart.js | Upload, results view, charts, ranking interaction, downloads |
| API Layer | Flask routes | Upload handling, ranking service, health endpoint, data retrieval/export |
| NLP Layer | NLTK, spaCy, PhraseMatcher, regex modules | Preprocessing, POS, NER, skill matching, info extraction |
| Utility Layer | File parser, data formatter, ranking utility | File decoding, conversion to JSON/CSV, comparative ranking logic |
| Session Layer | In-memory store by session id | Temporary retention of processed result sets |

---

## DEEP DIVE: NLP EXTRACTION PIPELINE

| Stage | Name | Description |
|---|---|---|
| 1 | Document Ingestion | Accepts PDF, DOCX/DOC, TXT files with upload constraints. |
| 2 | Text Extraction | Uses parsers suitable to format to obtain clean textual content. |
| 3 | Preprocessing | Lowercasing, tokenization, stopword filtering, sentence and word statistics. |
| 4 | Linguistic Analysis | POS tagging and NER using spaCy model for structural understanding. |
| 5 | Skill Detection | Dictionary-driven phrase matching plus regex normalization for versioned skills. |
| 6 | Profile Structuring | Builds candidate JSON with contact, summary, education, experience, categorized skills. |
| 7 | Ranking and Export | Computes skill match scores and generates JSON/CSV outputs for recruiter use. |

[DIAGRAM: Vertical pipeline from Resume Upload -> Text Extraction -> Preprocess -> POS and NER -> Skill Match -> Structured Profile -> Ranking and Export]

---

## KEY FEATURES AND SMART RECRUITER TOOLS

| Feature | Technical Implementation | Practical Benefit |
|---|---|---|
| Multi-file Upload | Frontend drag-drop + backend multipart processing | Batch screening in one run |
| Multi-format Support | PDF, DOCX/DOC, TXT parsers | Works with common resume formats |
| Skill Extraction | spaCy PhraseMatcher + 500+ skill dictionary | Faster talent mapping to role needs |
| Contact and Profile Extraction | Regex + NER + section parsing | Ready-to-use candidate summaries |
| Candidate Ranking | Required skill matching with score computation | Objective first-level shortlisting |
| Analytics Dashboard | Chart.js skill and category visualizations | Hiring trend visibility |
| Compare View | Side-by-side candidate statistics | Better recruiter decision support |
| Export Utilities | Individual and aggregate JSON/CSV outputs | Easy sharing, reporting, ATS bridging |
| NLP Transparency Tab | Entities, POS sample, token stats | Interpretability and auditability |

---

## SIMPLE PARSER VS THIS SYSTEM

| Capability | Basic Resume Parser | Smart Resume Skill Extractor |
|---|---|---|
| File Handling | Usually single text format | Multi-format, multi-file ingestion |
| Skill Detection | Keyword search only | PhraseMatcher plus categorized dictionary |
| Candidate Ranking | Not available | Role-skill score with matched and missing skills |
| Explainability | Low | Structured outputs with entities and category tags |
| Recruiter Analytics | Minimal | Charts, comparison, ranking, exports |
| Practical Utility | Limited | End-to-end recruiter support workflow |

---

## DETAILED TECHNOLOGY STACK

| Layer | Technology | Role |
|---|---|---|
| Backend Framework | Flask, Werkzeug | API routing, request handling, response delivery |
| NLP Core | spaCy, NLTK | POS, NER, tokenization, stopword handling |
| Skill Matching | PhraseMatcher + custom skill dictionary | Domain-specific skill extraction |
| File Parsing | PyMuPDF, pdfplumber, python-docx | Resume text extraction from documents |
| Data Processing | pandas | Structured transformation and export support |
| Frontend | HTML5, CSS3, JavaScript, Bootstrap | Interactive recruiter dashboard |
| Visualization | Chart.js | Skill frequency and category analytics |
| Environment and Config | python-dotenv | Configuration and deployment flexibility |

---

## CHALLENGES AND DEVELOPED SOLUTIONS

| Challenge | Impact | Implemented Solution |
|---|---|---|
| Unstructured resume formats | Inconsistent field detection | Section-aware parsing logic for education and experience |
| Heterogeneous terminology for same skill | Missed matches | Dictionary normalization and regex fallback |
| Noisy PDF text extraction | Partial data loss risk | Primary parser with fallback extraction path |
| Varying candidate profile styles | Difficult standardized output | Unified schema with graceful Not Found handling |
| Recruiter decision overload | Slow shortlisting | Ranking and visual analytics layer |
| Data portability needs | Manual copy burden | JSON and CSV export routes |

---

## ETHICAL, PRIVACY, AND NON-TECHNICAL CONSIDERATIONS

### Data Privacy
1. Resume content can contain sensitive personal data; therefore, data handling must follow least-retention principles.
2. Current version stores results in memory by session for temporary use, reducing persistent exposure.
3. Future versions should include encryption, retention policies, and access controls.

### Fairness and Bias
1. Skill-first ranking improves objectivity but can still inherit bias from job requirements.
2. Final hiring decisions should remain human-led, with AI as assistive tool only.
3. Future policy should include periodic fairness audits across demographic proxies where legally permissible.

### Usability and Adoption
1. Recruiters need fast workflows; drag-drop upload and ranking shortcuts reduce friction.
2. Visual analytics supports managerial reporting and collaboration.
3. Export features align with practical HR operations.

### Legal and Compliance Readiness
1. Consent and data processing notices are recommended before production use.
2. Role-based access and audit logs are essential for enterprise deployment.

---

## FUTURE ENHANCEMENTS AND RESEARCH DIRECTIONS

| Enhancement | Description | Value |
|---|---|---|
| Persistent Database | Move from in-memory session store to PostgreSQL or similar | Better scalability and auditability |
| Authentication and RBAC | User accounts, team roles, secure access control | Enterprise-ready security |
| Job Description Parser | Auto-extract required skills from JD text | Faster matching setup |
| Semantic Skill Similarity | Embedding-based near-skill mapping | Better handling of skill synonyms |
| Explainable Scoring | Weighted scoring with transparent criteria | Recruiter trust and compliance |
| Batch Evaluation Metrics | Precision and recall benchmarking on labeled dataset | Scientific validation |
| ATS Integration | API adapters for HRMS and ATS tools | Real-world adoption |
| Interview Recommendation Module | Suggest interview focus from candidate gaps | Better panel preparation |

---

## TESTING AND VALIDATION METHODOLOGY

### A. Component-Level Validation
1. Pipeline smoke testing with sample resumes.
2. Extraction verification for education and experience segmentation.
3. API route-level validation for upload, rank, results retrieval, and downloads.

### B. Integration-Level Validation
1. End-to-end flow from upload to dashboard rendering.
2. Ranking flow using recruiter-entered required skills.
3. JSON/CSV export correctness for individual and aggregate outputs.

### C. Usability Validation
1. Recruiter workflow coverage through tabs: candidates, ranking, analytics, compare, NLP data.
2. Error handling checks for unsupported formats and size limits.
3. Visual feedback checks through loading states and status indicators.

### Current Validation Status
1. Functional scripts and sample data are available for verification.
2. Formal benchmark dataset metrics are pending and planned as future work.
3. System behavior is deterministic and traceable through structured outputs.

---

## IMPLEMENTATION PLAN AND TIMELINE (GANTT-STYLE)

| Phase | Task Set | Duration | Deliverable |
|---|---|---|---|
| Phase 1 | Problem framing, architecture design, base Flask app setup | Weeks 1-2 | Initial project skeleton |
| Phase 2 | File parsing and NLP pipeline implementation | Weeks 3-6 | Core extraction engine |
| Phase 3 | Skill dictionary, ranking engine, data formatting utilities | Weeks 7-9 | Structured output and ranking |
| Phase 4 | Frontend dashboard, charts, compare and export workflows | Weeks 10-12 | End-to-end usable interface |
| Phase 5 | Testing scripts, sample validation, documentation and report | Weeks 13-16 | Final submission package |

[DIAGRAM: Horizontal Gantt chart with Weeks 1-16 on X-axis and Phases 1-5 on Y-axis]

---

## BUDGET AND RESOURCE REQUIREMENTS

| Item | Specification | Estimated Cost (INR) | Remarks |
|---|---|---:|---|
| Development Machine | Mid/high-end laptop or desktop | Already available | Existing academic resource |
| Software Stack | Open-source Python, NLP libraries, frontend libraries | 0 | No licensing cost |
| Hosting (Optional) | Basic cloud VM for demo deployment | 2,000-6,000 per month | Optional for public access |
| Internet and Misc | Data transfer and usage | Variable | Operational expense |
| Total (academic prototype) | Local execution mode | Near zero | Highly cost-effective |

---

## INSTALLATION AND SETUP GUIDE

### Prerequisites
1. Python 3.9 or above
2. Package manager support
3. Internet for dependency and model download

### Setup Steps
1. Install project dependencies.
2. Download the spaCy English model.
3. Download required NLTK datasets.
4. Start backend server.
5. Open local web interface and upload sample resumes.

### Operational Notes
1. Maximum file size per resume is 10 MB.
2. Supported extensions are PDF, DOCX, DOC, and TXT.
3. Session results are temporary in current implementation.

---

## CODE SNIPPETS (ILLUSTRATIVE)

### Snippet 1: Upload and Processing Route (Flask-style skeleton)
Define POST endpoint for upload  
Validate presence of resume files  
For each file:  
- Validate extension and size  
- Extract text from file parser  
- Run NLP processing pipeline  
- Append structured result with metadata  
Return session id, processed results, and error list as JSON

### Snippet 2: Skill Extraction Logic (Matcher + Category)
Load NLP model and skill dictionary  
Build PhraseMatcher with LOWER attribute  
Run matcher on parsed document  
Add regex fallback for versioned tech names  
Deduplicate matched skills  
Map each skill to category  
Return categorized skill list

### Snippet 3: Candidate Ranking Logic
Take required skills from recruiter input  
Normalize to lowercase  
For each candidate:  
- Compare required skills with extracted skills  
- Compute match percentage  
- Build matched and missing lists  
Sort candidates by descending score  
Return ranked candidate array

---

## CONCLUSION
Smart Resume Skill Extractor for Recruiters successfully demonstrates how practical NLP can transform raw resumes into structured, actionable candidate intelligence. The system addresses core recruitment pain points by automating extraction, categorization, ranking, and reporting.  
Technically, the project integrates robust backend APIs, linguistic analysis modules, and recruiter-centric visualization workflows. Non-technically, it supports operational efficiency, consistency in screening, and a transparent human-in-the-loop model for decision support.  
The current implementation is a strong academic and practical prototype. With persistence, access control, and standardized benchmarking, it can evolve into a production-ready AI-assisted recruitment platform.

---

## REFERENCES
1. spaCy Documentation, Industrial-Strength Natural Language Processing in Python.
2. NLTK Documentation, Natural Language Toolkit.
3. Flask Documentation, Web Application Framework.
4. Chart.js Documentation, Data Visualization Library.
5. PyMuPDF Documentation, PDF text extraction toolkit.
6. python-docx Documentation, DOCX processing in Python.
7. Information Extraction and Named Entity Recognition literature for applied NLP systems.
