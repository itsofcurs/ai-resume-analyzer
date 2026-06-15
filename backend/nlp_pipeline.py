"""
NLP Pipeline for Smart Resume Skill Extractor
==============================================
Pipeline steps:
  1. Text Preprocessing (tokenization, lowercasing, stopword removal)
  2. POS Tagging (spaCy)
  3. Named Entity Recognition (spaCy NER)
  4. Skill Extraction (PhraseMatcher + regex)
  5. Information Extraction (name, email, phone, education, experience)
"""

import logging
import re
from typing import Any, Dict, List

import spacy
from spacy.matcher import PhraseMatcher

from backend.skill_dictionary import categorize_skill, get_all_skills

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Load spaCy model (en_core_web_sm)
# ---------------------------------------------------------------------------
_NLP_MODEL = None


def get_nlp():
    """Lazy-load and cache the spaCy model."""
    global _NLP_MODEL
    if _NLP_MODEL is None:
        try:
            _NLP_MODEL = spacy.load("en_core_web_sm")
            logger.info("spaCy model 'en_core_web_sm' loaded successfully.")
        except OSError:
            logger.warning(
                "spaCy model not found. Run: python -m spacy download en_core_web_sm"
            )
            # Fallback: blank English model
            _NLP_MODEL = spacy.blank("en")
    return _NLP_MODEL


# ---------------------------------------------------------------------------
# Build PhraseMatcher for skill detection
# ---------------------------------------------------------------------------
def build_skill_matcher(nlp) -> PhraseMatcher:
    """
    Build a spaCy PhraseMatcher loaded with all known skills.
    Case-insensitive matching via LOWER attribute.
    """
    matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
    skills = get_all_skills()
    patterns = [nlp.make_doc(skill) for skill in skills]
    matcher.add("SKILL", patterns)
    return matcher


# ---------------------------------------------------------------------------
# Step 1: Preprocessing
# ---------------------------------------------------------------------------
def preprocess_text(text: str) -> Dict[str, Any]:
    """
    Apply NLP preprocessing to raw resume text.
    Returns tokens, cleaned text, and sentence count.
    """
    import nltk

    try:
        nltk.data.find("tokenizers/punkt")
    except LookupError:
        nltk.download("punkt", quiet=True)
    try:
        nltk.data.find("tokenizers/punkt_tab")
    except LookupError:
        nltk.download("punkt_tab", quiet=True)
    try:
        nltk.data.find("corpora/stopwords")
    except LookupError:
        nltk.download("stopwords", quiet=True)

    from nltk.corpus import stopwords
    from nltk.tokenize import sent_tokenize, word_tokenize

    stop_words = set(stopwords.words("english"))

    # Lowercase the text
    lower_text = text.lower()

    # Tokenize words
    tokens = word_tokenize(lower_text)

    # Remove stopwords and non-alphabetic tokens
    filtered_tokens = [t for t in tokens if t.isalpha() and t not in stop_words]

    # Sentence count
    sentences = sent_tokenize(text)

    return {
        "raw_text": text,
        "lower_text": lower_text,
        "tokens": tokens,
        "filtered_tokens": filtered_tokens,
        "sentence_count": len(sentences),
        "word_count": len(tokens),
    }


# ---------------------------------------------------------------------------
# Step 2 & 3: POS Tagging & NER via spaCy
# ---------------------------------------------------------------------------
def pos_and_ner(text: str) -> Dict[str, Any]:
    """
    Run spaCy POS tagging and NER on resume text.
    Returns:
      - pos_tags: list of (token, pos, tag) tuples
      - entities: list of (text, label) NER entities
      - noun_chunks: noun phrases from the text
    """
    nlp = get_nlp()
    doc = nlp(text[:100000])  # spaCy limit guard

    pos_tags = [
        {"token": token.text, "pos": token.pos_, "tag": token.tag_}
        for token in doc
        if not token.is_space and not token.is_punct
    ]

    entities = [
        {"text": ent.text.strip(), "label": ent.label_}
        for ent in doc.ents
        if ent.text.strip()
    ]

    noun_chunks = [chunk.text.strip() for chunk in doc.noun_chunks]

    return {
        "pos_tags": pos_tags,
        "entities": entities,
        "noun_chunks": noun_chunks,
        "doc": doc,
    }


# ---------------------------------------------------------------------------
# Step 4: Skill Extraction
# ---------------------------------------------------------------------------
def extract_skills(text: str, doc=None) -> List[Dict[str, str]]:
    """
    Extract skills using:
    1. spaCy PhraseMatcher against predefined skill dictionary
    2. Fallback regex for common patterns

    Returns a deduplicated list of dicts: {skill, category}
    """
    nlp = get_nlp()
    matcher = build_skill_matcher(nlp)

    if doc is None:
        doc = nlp(text[:100000])

    found_skills = set()
    matches = matcher(doc)
    for match_id, start, end in matches:
        span = doc[start:end]
        skill_text = span.text.lower().strip()
        found_skills.add(skill_text)

    # Additional regex-based patterns for versioned skills (e.g. Python 3.x)
    version_pattern = re.compile(
        r"\b(python|java|node\.?js|react|angular|vue|django|flask)\s*[\d\.x]+",
        re.IGNORECASE,
    )
    for match in version_pattern.finditer(text):
        # Normalize to base skill name
        base = match.group(1).lower().replace(".", "")
        found_skills.add(base)

    # Build result with categories
    result = []
    seen = set()
    for skill in sorted(found_skills):
        if skill not in seen:
            seen.add(skill)
            result.append({"skill": skill, "category": categorize_skill(skill)})

    return result


# ---------------------------------------------------------------------------
# Step 5: Information Extraction
# ---------------------------------------------------------------------------
EDUCATION_KEYWORDS = [
    "b.tech",
    "btech",
    "b.e",
    "be ",
    "m.tech",
    "mtech",
    "msc",
    "m.sc",
    "bsc",
    "b.sc",
    "bca",
    "mca",
    "b.com",
    "m.com",
    "mba",
    "phd",
    "ph.d",
    "bachelor",
    "master",
    "doctorate",
    "diploma",
    "degree",
    "engineering",
    "science",
    "arts",
    "commerce",
    "technology",
    "university",
    "college",
    "institute",
    "school",
    "iit",
    "nit",
    "bits",
    "vit",
    "manipal",
    "amity",
    "symbiosis",
]

EXPERIENCE_KEYWORDS = [
    "experience",
    "worked",
    "work",
    "employment",
    "intern",
    "internship",
    "project",
    "position",
    "role",
    "company",
    "organization",
    "firm",
    "developer",
    "engineer",
    "analyst",
    "manager",
    "lead",
    "architect",
    "consultant",
    "specialist",
    "coordinator",
    "associate",
]

SECTION_HEADERS = {
    "education": ["education", "academic", "qualification", "degree"],
    "experience": ["experience", "work history", "employment", "career"],
    "skills": ["skills", "technical skills", "competencies", "expertise"],
    "projects": ["projects", "project work", "key projects"],
    "certifications": ["certifications", "certificates", "achievements"],
    "summary": ["summary", "objective", "profile", "about"],
}


def extract_name(text: str, entities: List[Dict]) -> str:
    """
    Extract candidate name from NER entities (PERSON label).
    Falls back to the first capitalized full name in text.
    """
    # 1. Try spaCy PERSON entities
    person_entities = [e["text"] for e in entities if e["label"] == "PERSON"]
    if person_entities:
        # Use the first, typically the candidate's name
        return person_entities[0].strip()

    # 2. Fallback: look for "Name: <value>" pattern
    name_pattern = re.compile(
        r"(?:name|full name)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",
        re.IGNORECASE,
    )
    match = name_pattern.search(text)
    if match:
        return match.group(1).strip()

    # 3. Fallback: first line that looks like a proper name (2-4 words, titlecase)
    for line in text.splitlines()[:10]:
        line = line.strip()
        words = line.split()
        if 2 <= len(words) <= 4 and all(
            w[0].isupper() for w in words if w and w[0].isalpha()
        ):
            # Make sure it's not a section header
            if not any(
                kw in line.lower()
                for kw in ["resume", "curriculum", "vitae", "cv", "profile"]
            ):
                return line

    return "Not Found"


def extract_email(text: str) -> str:
    """Extract email address from text using regex."""
    pattern = re.compile(
        r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
        re.IGNORECASE,
    )
    match = pattern.search(text)
    return match.group(0) if match else "Not Found"


def extract_phone(text: str) -> str:
    """Extract phone number from text using regex."""
    patterns = [
        r"(\+91[\-\s]?)?[6-9]\d{9}",  # Indian mobile
        r"\+?1?[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}",  # US format
        r"(\+\d{1,3}[\s\-])?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}",  # generic
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0).strip()
    return "Not Found"


def extract_linkedin(text: str) -> str:
    """Extract LinkedIn profile URL."""
    pattern = re.compile(
        r"(?:linkedin\.com/in/|linkedin:\s*)([a-zA-Z0-9\-]+)", re.IGNORECASE
    )
    match = pattern.search(text)
    if match:
        return f"https://linkedin.com/in/{match.group(1)}"
    return "Not Found"


def extract_github(text: str) -> str:
    """Extract GitHub profile URL."""
    pattern = re.compile(r"(?:github\.com/|github:\s*)([a-zA-Z0-9\-]+)", re.IGNORECASE)
    match = pattern.search(text)
    if match:
        return f"https://github.com/{match.group(1)}"
    return "Not Found"


def extract_education(text: str, entities: List[Dict]) -> List[Dict]:
    """
    Extract education details including degree, institution, and year.
    Parses education section line-by-line: degree → institution → year.
    """
    lines = [l.strip() for l in text.splitlines()]

    # --- Section detection (with length guard to avoid matching content lines) ---
    start_idx, end_idx = -1, len(lines)
    for i, line in enumerate(lines):
        lower = line.lower()
        if start_idx == -1:
            if len(line) < 50 and any(
                h in lower for h in ["education", "academic", "qualification"]
            ):
                start_idx = i + 1
        else:
            if len(line) < 40 and any(
                h in lower
                for h in [
                    "experience",
                    "work",
                    "skill",
                    "project",
                    "certif",
                    "achievement",
                    "employment",
                    "career",
                    "language",
                    "interest",
                    "reference",
                ]
            ):
                end_idx = i
                break

    section = lines[start_idx:end_idx] if start_idx != -1 else lines[:30]

    # --- Patterns ---
    degree_re = re.compile(
        r"\b(b\.?tech|b\.?e\.?|m\.?tech|m\.?e\.?|b\.?sc|m\.?sc|bca|mca|"
        r"mba|b\.?com|m\.?com|phd|ph\.?d\.?|bachelor[s']*|master[s']*|"
        r"diploma|b\.?a\.?|m\.?a\.?|b\.?s\.?|m\.?s\.?)\b",
        re.IGNORECASE,
    )
    # FIX: capture group wraps ENTIRE 4-digit year, not just the prefix
    year_re = re.compile(r"\b((?:19|20)\d{2})\b")

    bullet_re = re.compile(r"^[-•*►▸→✓]|^\d+[.)]")  # skip bullet lines

    education_entries = []
    current = None

    for line in section:
        if not line or bullet_re.match(line):
            continue

        has_degree = bool(degree_re.search(line))
        years = year_re.findall(line)  # returns full 4-digit strings

        if has_degree:
            # Save previous entry
            if current:
                education_entries.append(current)
            current = {
                "degree": line,
                "institution": "",
                # Year may appear on the degree line itself (e.g., "B.Tech (2016-2020)")
                "year": " - ".join(years[:2]) if years else "",
            }
        elif current and not current["institution"] and not years:
            # First non-degree, non-year line after degree = institution
            current["institution"] = line
        elif current and years and not current["year"]:
            # Standalone year line (e.g., "2016 - 2020" or "2016 – 2020")
            current["year"] = " - ".join(years[:2])
        elif current and not current["institution"] and years:
            # Institution + year on the same line
            current["institution"] = line
            if not current["year"]:
                current["year"] = " - ".join(years[:2])

    if current:
        education_entries.append(current)

    # NER fallback: use ORG entities that look like institutes
    if not education_entries:
        for ent in entities:
            if ent["label"] == "ORG" and any(
                kw in ent["text"].lower()
                for kw in ["university", "college", "institute", "school", "iit", "nit"]
            ):
                education_entries.append(
                    {
                        "degree": "Not specified",
                        "institution": ent["text"],
                        "year": "",
                    }
                )

    return (
        education_entries
        if education_entries
        else [{"degree": "Not Found", "institution": "Not Found", "year": ""}]
    )


def extract_experience(text: str, entities: List[Dict]) -> List[Dict]:
    """
    Extract work experience entries using a state machine:
      IDLE → ROLE → COMPANY → DURATION → (repeat)
    Bullet points are skipped so their content never pollutes role/company fields.
    A new experience block begins only when a fresh role-keyword line is found.
    """
    lines = [l.strip() for l in text.splitlines()]

    # --- Section detection (length guard prevents matching body text) ---
    start_idx, end_idx = -1, len(lines)
    exp_headers = [
        "work experience",
        "professional experience",
        "employment history",
        "work history",
        "career history",
        "experience",
    ]
    end_headers = [
        "education",
        "academic",
        "qualification",
        "skills",
        "technical skills",
        "projects",
        "certifications",
        "certificates",
        "achievements",
        "languages",
        "interests",
        "references",
        "hobbies",
    ]
    for i, line in enumerate(lines):
        lower = line.lower()
        if start_idx == -1:
            if len(line) < 55 and any(h in lower for h in exp_headers):
                start_idx = i + 1
        else:
            if len(line) < 40 and any(h in lower for h in end_headers):
                end_idx = i
                break

    if start_idx == -1:
        return [{"role": "Not Found", "company": "Not Found", "duration": "Not Found"}]

    section = lines[start_idx:end_idx]

    # --- Patterns ---
    duration_re = re.compile(
        r"(?:"
        r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s*\d{4}"
        r"\s*[-–to]+\s*"
        r"(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s*\d{4}|present|current|now)"
        r"|\d{4}\s*[-–to]+\s*(?:\d{4}|present|current|now)"
        r")",
        re.IGNORECASE,
    )

    role_re = re.compile(
        r"\b(software|senior|junior|lead|principal|associate|full[\s-]?stack|"
        r"front[\s-]?end|back[\s-]?end|developer|engineer|analyst|manager|"
        r"architect|intern|trainee|consultant|specialist|designer|devops|"
        r"data scientist|machine learning|product manager|scrum master|"
        r"head of|director|founder|vice president)\b",
        re.IGNORECASE,
    )

    # Lines that START with a bullet marker are descriptive and must be skipped
    bullet_re = re.compile(r"^[-•*►▸→✓]|^\d+[.)]\s")

    # --- State machine ---
    # States: IDLE, ROLE, COMPANY, DURATION
    experiences: List[Dict] = []
    state = "IDLE"
    current: Dict = {}

    def _save():
        """Append current entry if it has at least role or company."""
        if current and (current.get("role") or current.get("company")):
            experiences.append(dict(current))

    for line in section:
        if not line:
            continue

        is_bullet = bool(bullet_re.match(line))
        has_dur = bool(duration_re.search(line))
        has_role = bool(role_re.search(line))

        # ── Bullet lines: skip completely ──────────────────────────────────
        if is_bullet:
            continue

        # ── Duration line ─────────────────────────────────────────────────
        if has_dur:
            dur_text = duration_re.search(line).group(0).strip()
            if state in ("ROLE", "COMPANY"):
                # Fill duration for the current entry, stay in DURATION state
                current["duration"] = dur_text
                state = "DURATION"
            else:
                # Duration arrived without prior role/company context;
                # save whatever we had and start a minimal entry
                _save()
                current = {"role": "", "company": "", "duration": dur_text}
                state = "DURATION"
            continue

        # ── Role keyword line (not a bullet, not a duration) ───────────────
        if has_role:
            if state == "IDLE" or state == "DURATION":
                # Start a brand-new experience block
                _save()
                current = {"role": line, "company": "", "duration": ""}
                state = "ROLE"
            elif state == "ROLE":
                # Two consecutive role lines → previous had no company/duration
                # Keep the more descriptive one (usually the first)
                if not current["company"] and not current["duration"]:
                    current["role"] = line  # overwrite with latest role line
                else:
                    _save()
                    current = {"role": line, "company": "", "duration": ""}
                    state = "ROLE"
            elif state == "COMPANY":
                # A role keyword appeared where we expected more company info —
                # treat as start of next block
                _save()
                current = {"role": line, "company": "", "duration": ""}
                state = "ROLE"
            continue

        # ── Plain text line (no bullet, no duration, no role keyword) ──────
        if state == "ROLE" and not current["company"]:
            # First plain line after a role = company name
            current["company"] = line
            state = "COMPANY"
        # All other plain lines (extra address, city, etc.) are ignored

    # Save the last open entry
    _save()

    # Remove duplicates and entries that are completely empty
    seen_keys: set = set()
    deduped: List[Dict] = []
    for e in experiences:
        key = (e.get("role", ""), e.get("company", ""), e.get("duration", ""))
        if key not in seen_keys and any(v for v in key):
            seen_keys.add(key)
            # Fill any blank field with a dash for display clarity
            deduped.append(
                {
                    "role": e.get("role") or "Not specified",
                    "company": e.get("company") or "Not specified",
                    "duration": e.get("duration") or "Not specified",
                }
            )

    return (
        deduped
        if deduped
        else [{"role": "Not Found", "company": "Not Found", "duration": "Not Found"}]
    )


def extract_summary(text: str) -> str:
    """Extract objective/summary section from resume."""
    lines = text.splitlines()
    in_summary = False
    summary_lines = []

    for line in lines:
        lower = line.lower().strip()
        if any(
            h in lower
            for h in ["summary", "objective", "profile", "about me", "career objective"]
        ):
            in_summary = True
            continue
        if in_summary:
            if any(
                h in lower
                for h in ["education", "skills", "experience", "project", "certif"]
            ):
                break
            if line.strip():
                summary_lines.append(line.strip())
            if len(summary_lines) >= 5:
                break

    return " ".join(summary_lines) if summary_lines else ""


# ---------------------------------------------------------------------------
# Main Pipeline Entry Point
# ---------------------------------------------------------------------------
def process_resume(text: str) -> Dict[str, Any]:
    """
    Full NLP pipeline for one resume.
    Returns a structured dictionary of extracted information.
    """
    if not text or not text.strip():
        return {"error": "Empty or unreadable resume text."}

    # Step 1: Preprocessing
    preprocessed = preprocess_text(text)

    # Step 2 & 3: POS Tagging + NER
    nlp_results = pos_and_ner(text)
    entities = nlp_results["entities"]
    doc = nlp_results["doc"]

    # Step 4: Skill Extraction
    skills = extract_skills(text, doc=doc)

    # Step 5: Information Extraction
    name = extract_name(text, entities)
    email = extract_email(text)
    phone = extract_phone(text)
    linkedin = extract_linkedin(text)
    github = extract_github(text)
    education = extract_education(text, entities)
    experience = extract_experience(text, entities)
    summary = extract_summary(text)

    # Group skills by category for UI display
    skill_categories: Dict[str, List[str]] = {}
    for s in skills:
        cat = s["category"]
        skill_categories.setdefault(cat, []).append(s["skill"])

    return {
        "name": name,
        "email": email,
        "phone": phone,
        "linkedin": linkedin,
        "github": github,
        "summary": summary,
        "skills": skills,
        "skill_categories": skill_categories,
        "education": education,
        "experience": experience,
        "entities": entities[:50],  # limit for UI
        "pos_sample": nlp_results["pos_tags"][:30],  # sample for display
        "word_count": preprocessed["word_count"],
        "sentence_count": preprocessed["sentence_count"],
        "filtered_tokens_count": len(preprocessed["filtered_tokens"]),
    }
