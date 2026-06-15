import json

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from utils.file_parser import extract_text

from .auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    role_required,
    verify_password,
)
from .copilot import analyze_job_fit, detect_fraud, generate_candidate_summary
from .db import Base, engine, get_db
from .matcher import index_resume, semantic_search
from .models import JobDescription, Resume, User
from .nlp_pipeline import process_resume
from .schemas import JobDescriptionCreate, MatchRequest, Token, UserCreate, UserLogin

app = FastAPI(title="AI Talent Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev; restrict in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Websocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                pass


manager = ConnectionManager()


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# --- AUTH ROUTES ---
@app.post("/api/auth/register")
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(
        email=user.email,
        hashed_password=get_password_hash(user.password),
        name=user.name,
        role="Recruiter",  # Default
    )
    db.add(new_user)
    await db.commit()
    return {"message": "User created successfully"}


@app.post("/api/auth/login", response_model=Token)
async def login(user: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user.email))
    db_user = result.scalars().first()

    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(
        data={"sub": str(db_user.id), "role": db_user.role}
    )
    return {"access_token": access_token, "token_type": "bearer", "role": db_user.role}


# --- WEBSOCKET FOR REALTIME TRACKING ---
@app.websocket("/ws/analytics")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
            # client might ping, we just keep connection open
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# --- RESUME ROUTES ---
@app.post("/api/resumes/upload")
async def upload_resume(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(role_required(["Recruiter", "Admin"])),
):
    await manager.broadcast(
        json.dumps({"event": "processing_start", "filename": file.filename})
    )

    file_bytes = await file.read()
    raw_text = extract_text(file.filename, file_bytes)

    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text")

    # NLP Pipeline
    extracted_data = process_resume(raw_text)

    # Save to DB
    new_resume = Resume(
        filename=file.filename,
        raw_text=raw_text,
        parsed_data=extracted_data,
        candidate_name=extracted_data.get("name", "Unknown"),
        candidate_email=extracted_data.get("email", "Unknown"),
    )
    db.add(new_resume)
    await db.commit()
    await db.refresh(new_resume)

    # Vector Search Indexing
    index_resume(new_resume.id, extracted_data, raw_text)

    await manager.broadcast(
        json.dumps(
            {
                "event": "processing_complete",
                "resume_id": new_resume.id,
                "name": new_resume.candidate_name,
            }
        )
    )

    return {"message": "Success", "resume_id": new_resume.id, "data": extracted_data}


@app.get("/api/resumes")
async def get_resumes(
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)
):
    result = await db.execute(select(Resume).order_by(Resume.created_at.desc()))
    return result.scalars().all()


# --- JOB DESCRIPTION & MATCHING ---
@app.post("/api/jobs")
async def create_job(
    job: JobDescriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    new_job = JobDescription(title=job.title, description=job.description)
    db.add(new_job)
    await db.commit()
    await db.refresh(new_job)
    return new_job


@app.get("/api/jobs")
async def get_jobs(
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)
):
    result = await db.execute(
        select(JobDescription).order_by(JobDescription.created_at.desc())
    )
    return result.scalars().all()


@app.get("/api/jobs/{job_id}/match")
async def semantic_job_match(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # 1. Fetch Job
    job = await db.get(JobDescription, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # 2. Semantic Search
    query = f"{job.title} {job.description}"
    matches = semantic_search(query, n_results=10)

    return {"job_id": job_id, "semantic_matches": matches}


# --- COPILOT / GENERATIVE AI ROUTES ---
@app.get("/api/copilot/summary/{resume_id}")
async def copilot_summary(resume_id: int, db: AsyncSession = Depends(get_db)):
    resume = await db.get(Resume, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    summary = await generate_candidate_summary(resume.parsed_data)
    return {"summary": summary, "cached": False}


@app.post("/api/copilot/analyze_fit")
async def copilot_analyze_fit(req: MatchRequest, db: AsyncSession = Depends(get_db)):
    resume = await db.get(Resume, req.resume_id)
    job = await db.get(JobDescription, req.job_id)
    if not resume or not job:
        raise HTTPException(status_code=404, detail="Not found")

    analysis = await analyze_job_fit(resume.parsed_data, job.description)
    return analysis


@app.get("/api/copilot/fraud_check/{resume_id}")
async def fraud_check(resume_id: int, db: AsyncSession = Depends(get_db)):
    resume = await db.get(Resume, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Not found")

    result = await detect_fraud(resume.parsed_data, resume.raw_text)
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
