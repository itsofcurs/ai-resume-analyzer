"""
main.py
--------
FastAPI application entry point for the AI Recruitment Intelligence Service.

Architecture note:
  This file is intentionally kept thin — it only owns:
    1. App bootstrap (FastAPI instance, CORS, logging)
    2. Pydantic request/response models for the HTTP layer
    3. Route handlers that delegate immediately to the workflow layer

  All business logic lives in:
    workflows/resume_workflow.py  → pipeline orchestration
    agents/resume_parser.py       → structured LLM extraction
    services/gemini_service.py    → LLM client management
    schemas/resume_schema.py      → data contracts
    database.py                   → MongoDB + ChromaDB connections
    embeddings.py                 → sentence-transformer vector generation

API surface (UNCHANGED — backward-compatible with Node.js gateway):
  POST /api/process   → trigger async resume processing pipeline
  POST /api/search    → semantic search across indexed resumes
  GET  /api/health    → liveness check
"""

import asyncio
import logging
import json
import time
import uuid

from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi import Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Internal imports — database and embeddings are kept at root level
# ---------------------------------------------------------------------------
from database import get_mongo_collection, mongo_health_check, vector_search, vector_search_ready
from embeddings import generate_embedding, generate_query_embedding, embedding_ready

# ---------------------------------------------------------------------------
# New modular architecture imports
# ---------------------------------------------------------------------------
from workflows.resume_workflow import ResumeWorkflow
from workflows.job_match_workflow import JobMatchWorkflow
from workflows.batch_job_match_workflow import BatchJobMatchWorkflow
from workflows.recommendation_workflow import RecommendationWorkflow
from workflows.comparison_workflow import ComparisonWorkflow
from workflows.copilot_workflow import CopilotWorkflow
from schemas.job_match_schema import JobMatchRequestSchema, FinalATSAnalysisSchema
from schemas.ranking_schema import BatchRankingRequestSchema, BatchRankingResponseSchema
from schemas.error_schema import ErrorResponseSchema
from core.config import get_settings, Settings
from core.errors import (
    ATSProcessingError,
    CacheError,
    EmbeddingError,
    InvalidResumeError,
    RecruiterValidationError,
    WorkflowTimeoutError,
)
from services.cache_service import cache_service
from services.job_queue_service import job_queue_service
from services.rate_limit_service import RateLimitService, ConcurrencyGuard
from services.redis_rate_limit_backend import RedisRateLimiter
from services.workflow_trace_service import workflow_trace_service
from services.gemini_service import GeminiService
from services.candidate_ranker import CandidateRanker, RankingThresholds
from services.metrics_service import API_REQUESTS, API_LATENCY
from utils.advanced_security_guardrails import parse_api_keys, require_api_key

from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response as FastAPIResponse

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
OPENAPI_TAGS = [
    {"name": "Processing", "description": "Resume ingestion and processing pipelines."},
    {"name": "Search", "description": "Semantic resume search endpoints."},
    {"name": "Recruiter ATS", "description": "Recruiter-facing ATS scoring and ranking."},
    {"name": "Health", "description": "Operational health and readiness endpoints."},
]

app = FastAPI(
    title="AI Recruitment Intelligence Service",
    description=(
        "Modular AI microservice for resume parsing, semantic search, "
        "and candidate authenticity scoring. Built with FastAPI, LangChain, "
        "Google Gemini, ChromaDB, and MongoDB."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=OPENAPI_TAGS,
)

# CORS — allow the Node.js gateway to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Restrict to gateway origin in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Startup: configuration validation + shared services
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def _startup() -> None:
    settings = get_settings()
    app.state.settings = settings
    app.state.rate_limiter = RateLimitService(
        invalid_threshold=settings.invalid_payload_block_threshold,
        invalid_block_seconds=settings.invalid_payload_block_seconds,
    )
    # Optional distributed rate limiting (Redis). Fail open to in-memory limiter.
    app.state.redis_rate_limiter = None
    if settings.redis_url:
        try:
            app.state.redis_rate_limiter = RedisRateLimiter(
                redis_url=settings.redis_url,
                namespace=settings.cache_namespace,
            )
        except Exception:
            app.state.redis_rate_limiter = None
    app.state.concurrency_guard = ConcurrencyGuard(default_limit=settings.max_inflight_search)
    app.state.batch_workflow = BatchJobMatchWorkflow(
        max_concurrency=settings.max_batch_concurrency,
        parse_timeout_s=settings.batch_parse_timeout_s,
        score_timeout_s=settings.batch_score_timeout_s,
        ranker=CandidateRanker(
            RankingThresholds(
                strong_match=settings.shortlist_strong_match,
                good_match=settings.shortlist_good_match,
                borderline=settings.shortlist_borderline,
            )
        ),
    )


# ---------------------------------------------------------------------------
# Request guard middleware (size limits, rate limits, concurrency, timeouts)
# ---------------------------------------------------------------------------
@app.middleware("http")
async def request_guard(request: Request, call_next):
    settings: Settings = getattr(request.app.state, "settings", Settings())
    limiter: RateLimitService = getattr(request.app.state, "rate_limiter", None)
    redis_limiter: RedisRateLimiter | None = getattr(request.app.state, "redis_rate_limiter", None)
    guard: ConcurrencyGuard = getattr(request.app.state, "concurrency_guard", None)

    path = request.url.path
    if path == "/" or path.startswith("/api/health") or path.startswith("/api/metrics") or path.startswith("/api/system"):
        return await call_next(request)

    internal_key = request.headers.get("x-internal-api-key")
    if settings.internal_api_key and internal_key != settings.internal_api_key:
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized. Invalid Internal API Key.", "error_code": "unauthorized"}
        )

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.max_request_size_bytes:
        return JSONResponse(
            status_code=413,
            content={"detail": "Request payload too large.", "error_code": "payload_too_large"},
        )

    client_ip = request.headers.get("x-forwarded-for") or (request.client.host if request.client else "unknown")
    key = f"{client_ip}:{path}"

    rate_limit = _rate_limit_for_path(path, settings)
    if rate_limit:
        allowed = True
        if redis_limiter is not None:
            allowed = redis_limiter.allow(key, limit=rate_limit["limit"], window_seconds=rate_limit["window"])
        elif limiter is not None:
            allowed = limiter.allow(key, limit=rate_limit["limit"], window_seconds=rate_limit["window"])
        if not allowed:
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Please retry later.", "error_code": "rate_limited"})

    timeout_s = _timeout_for_path(path, settings)
    concurrency_limit = _concurrency_limit_for_path(path, settings)
    method = request.method
    start = time.perf_counter()
    if guard:
        async with guard.acquire(path, limit=concurrency_limit):
            try:
                if timeout_s:
                    response = await asyncio.wait_for(call_next(request), timeout=timeout_s)
                else:
                    response = await call_next(request)
                return response
            except asyncio.TimeoutError:
                return JSONResponse(
                    status_code=504,
                    content={"detail": "Request timed out. Please retry.", "error_code": "timeout"},
                )
    response = await call_next(request)
    return response


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    # Avoid labeling explosion: only track /api/* paths (not docs/assets)
    if path.startswith("/api/"):
        API_REQUESTS.labels(path=path, method=method, status=str(response.status_code)).inc()
        API_LATENCY.labels(path=path, method=method).observe(elapsed)
    return response

# ---------------------------------------------------------------------------
# Shared workflow instances
# ---------------------------------------------------------------------------
_resume_workflow = ResumeWorkflow()
_job_match_workflow = JobMatchWorkflow()
_recommendation_workflow = RecommendationWorkflow()
_comparison_workflow = ComparisonWorkflow()
_copilot_workflow = CopilotWorkflow()


# ---------------------------------------------------------------------------
# HTTP Request / Response models
# (These are FastAPI-layer models only — NOT the same as schemas/resume_schema.py)
# ---------------------------------------------------------------------------

class ProcessRequest(BaseModel):
    """
    Payload sent by the Node.js gateway after a successful Cloudinary upload.

    Fields:
        resume_id:      MongoDB ObjectId string of the PENDING resume document.
        cloudinary_url: CDN URL of the uploaded resume file.
        filename:       Original filename — used to detect format (pdf/txt/docx).
    """
    resume_id: str
    cloudinary_url: str
    filename: str


class SearchRequest(BaseModel):
    """
    Payload for semantic resume search via ChromaDB.

    Fields:
        query: Natural language recruiter query
               (e.g. "Senior backend dev with Kubernetes experience").
        top_k: Number of closest matches to return (default: 5).
    """
    query: str
    top_k: int = 5

class RecommendRequest(BaseModel):
    job_description: str
    top_k: int = 5

class CompareRequest(BaseModel):
    candidate_a_id: str
    candidate_b_id: str

class CopilotRequest(BaseModel):
    query: str



# ---------------------------------------------------------------------------
# Request guard helpers
# ---------------------------------------------------------------------------

def _rate_limit_for_path(path: str, settings: Settings) -> dict | None:
    if path == "/api/job-match":
        return {"limit": settings.rate_limit_job_match_per_min, "window": 60}
    if path == "/api/job-match/batch":
        return {"limit": settings.rate_limit_batch_per_min, "window": 60}
    if path == "/api/process":
        return {"limit": settings.rate_limit_process_per_min, "window": 60}
    if path == "/api/search":
        return {"limit": settings.rate_limit_search_per_min, "window": 60}
    return None


def _timeout_for_path(path: str, settings: Settings) -> float | None:
    if path == "/api/job-match":
        return settings.request_timeout_job_match_s
    if path == "/api/job-match/batch":
        return settings.request_timeout_batch_s
    if path == "/api/process":
        return settings.request_timeout_process_s
    if path == "/api/search":
        return settings.request_timeout_search_s
    return None


def _concurrency_limit_for_path(path: str, settings: Settings) -> int | None:
    if path == "/api/job-match":
        return settings.max_inflight_job_match
    if path == "/api/job-match/batch":
        return settings.max_inflight_batch
    if path == "/api/process":
        return settings.max_inflight_process
    if path == "/api/search":
        return settings.max_inflight_search
    return None


async def _dependency_snapshot() -> dict[str, dict]:
    gemini_status = GeminiService.get_instance().health_check()
    mongo_ok = await mongo_health_check()
    vector_ok = vector_search_ready()
    embeddings_ok = embedding_ready()
    cache_status = cache_service.health()
    queue_status = job_queue_service.health()
    return {
        "gemini": gemini_status,
        "mongodb": {"status": "ready" if mongo_ok else "unavailable"},
        "vector_search": {"status": "ready" if vector_ok else "unavailable"},
        "embeddings": {"status": "ready" if embeddings_ok else "unavailable"},
        "cache": cache_status,
        "job_queue": queue_status,
    }


def _dependency_ready(status: str | None) -> bool:
    if status in (None, ""):
        return False
    return status in {"ready", "ok", "lazy", "disabled"}


# ---------------------------------------------------------------------------
# Exception handlers (traceback suppression + abuse throttling)
# ---------------------------------------------------------------------------

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    limiter: RateLimitService = getattr(request.app.state, "rate_limiter", None)
    client_ip = request.headers.get("x-forwarded-for") or (request.client.host if request.client else "unknown")
    key = f"{client_ip}:{request.url.path}"
    if limiter:
        limiter.record_invalid(key)
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Invalid request payload. Please verify the schema.",
            "error_code": "validation_error",
        },
    )


@app.exception_handler(RecruiterValidationError)
async def recruiter_validation_handler(request: Request, exc: RecruiterValidationError):
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc), "error_code": "invalid_request"},
    )


@app.exception_handler(InvalidResumeError)
async def invalid_resume_handler(request: Request, exc: InvalidResumeError):
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc), "error_code": "invalid_resume"},
    )


@app.exception_handler(WorkflowTimeoutError)
async def workflow_timeout_handler(request: Request, exc: WorkflowTimeoutError):
    return JSONResponse(
        status_code=504,
        content={"detail": "Workflow timed out. Please retry.", "error_code": "workflow_timeout"},
    )


@app.exception_handler(ATSProcessingError)
@app.exception_handler(EmbeddingError)
@app.exception_handler(CacheError)
async def processing_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=503,
        content={"detail": "Processing service unavailable. Please retry.", "error_code": "processing_unavailable"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled API error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error.", "error_code": "internal_error"},
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get(
    "/",
    summary="Root health check",
    tags=["Health"],
)
async def root_health_check():
    """Render pings this route to verify service liveness."""
    return {"status": "ok", "service": "talentai-python-service"}

@app.post(
    "/api/process",
    summary="Trigger async resume processing pipeline",
    tags=["Processing"],
    responses={
        400: {"model": ErrorResponseSchema, "description": "Validation error"},
        413: {"model": ErrorResponseSchema, "description": "Payload too large"},
        429: {"model": ErrorResponseSchema, "description": "Rate limited"},
    },
)
async def process_resume(req: ProcessRequest, background_tasks: BackgroundTasks, request: Request):
    """
    Webhook endpoint called by the Node.js gateway after a Cloudinary upload.

    Immediately returns 202-style acknowledgement, then runs the full
    processing pipeline as a FastAPI BackgroundTask:

      download → extract text → parse (LangChain+Gemini) → embed → ChromaDB → MongoDB

    The resume document status in MongoDB transitions:
      PENDING → EXTRACTING → ANALYZING → PROCESSED  (or FAILED on error)

    Args:
        req: ProcessRequest with resume_id, cloudinary_url, filename.

    Returns:
        JSON acknowledgement. The actual result is written to MongoDB
        and the Node.js gateway polls / listens via Socket.io.
    """
    settings: Settings = getattr(request.app.state, "settings", get_settings())
    if settings.internal_api_key:
        require_api_key(request.headers.get("x-api-key"), [settings.internal_api_key])

    if not req.resume_id or not req.cloudinary_url:
        raise HTTPException(
            status_code=400,
            detail="Missing required fields: resume_id and cloudinary_url are required.",
        )

    logger.info(
        "POST /api/process — queuing pipeline for resume_id=%s file='%s'",
        req.resume_id,
        req.filename,
    )

    # Delegate entirely to the workflow layer — no business logic in the route
    background_tasks.add_task(
        _resume_workflow.run,
        req.resume_id,
        req.cloudinary_url,
        req.filename,
    )

    return {
        "message": "AI Processing Pipeline Started",
        "resume_id": req.resume_id,
        "pipeline_version": "2.0.0",
    }


@app.post(
    "/api/search",
    summary="Semantic resume search via ChromaDB",
    tags=["Search"],
    responses={
        400: {"model": ErrorResponseSchema, "description": "Validation error"},
        429: {"model": ErrorResponseSchema, "description": "Rate limited"},
        500: {"model": ErrorResponseSchema, "description": "Search failure"},
    },
)
async def semantic_search(req: SearchRequest, request: Request):
    """
    Perform semantic search across indexed resumes using Vector Search.

    Args:
        req: SearchRequest with query string and top_k count.

    Returns:
        JSON with a list of matches including resume_id, text snippet, and distance score.

    Raises:
        HTTPException 500: If vector search is not available or search fails.
    """
    settings: Settings = getattr(request.app.state, "settings", get_settings())
    if settings.internal_api_key:
        require_api_key(request.headers.get("x-api-key"), [settings.internal_api_key])

    if not vector_search_ready():
        raise HTTPException(
            status_code=500,
            detail="Vector search is not available.",
        )

    try:
        logger.info("POST /api/search — query='%s' top_k=%d", req.query, req.top_k)
        query_vector = generate_query_embedding(req.query)

        matches = await vector_search(query_vector, top_k=req.top_k)

        logger.info(
            "POST /api/search — returned %d matches for query='%s'",
            len(matches),
            req.query,
        )
        return {"query": req.query, "matches": matches}

    except Exception as exc:
        logger.error("POST /api/search — failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Semantic search failed: {str(exc)}",
        )


@app.post(
    "/api/recommend",
    summary="Recommend top candidates for a job description",
    tags=["Phase2A"],
)
async def recommend_candidates(req: RecommendRequest):
    try:
        logger.info("POST /api/recommend — top_k=%d", req.top_k)
        result = await _recommendation_workflow.run(req.job_description, req.top_k)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("POST /api/recommend — failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post(
    "/api/compare",
    summary="Compare two candidates",
    tags=["Phase2A"],
)
async def compare_candidates(req: CompareRequest):
    try:
        logger.info("POST /api/compare — a=%s b=%s", req.candidate_a_id, req.candidate_b_id)
        result = await _comparison_workflow.run(req.candidate_a_id, req.candidate_b_id)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("POST /api/compare — failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post(
    "/api/copilot/chat",
    summary="Recruiter Copilot Chat",
    tags=["Phase2A"],
)
async def copilot_chat(req: CopilotRequest):
    try:
        logger.info("POST /api/copilot/chat — query='%s'", req.query)
        result = await _copilot_workflow.run(req.query)
        return result
    except Exception as exc:
        logger.error("POST /api/copilot/chat — failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))



@app.get(
    "/api/health",
    summary="Service liveness check",
    tags=["Health"],
)
def health_check():
    """
    Liveness check endpoint.

    Returns service status and version. Used by the Node.js gateway and
    infrastructure health monitors to confirm the service is running.

    Returns:
        JSON with status, service name, and pipeline version.
    """
    vector_ok = vector_search_ready()

    return {
        "status": "ok",
        "service": "AI Recruitment Intelligence",
        "pipeline_version": "2.2.0-Phase2A",
        "components": {
            "mongodb": "connected",
            "vector_search": "ready" if vector_ok else "unavailable",
            "gemini": "lazy-init",
            "embeddings": "gemini-api",
        },
    }


@app.get("/api/health/live", summary="Liveness check", tags=["Health"])
async def health_live():
    return {"status": "ok"}


@app.get("/api/health/ready", summary="Readiness check", tags=["Health"])
async def health_ready():
    deps = await _dependency_snapshot()
    ready = all(_dependency_ready(dep.get("status")) for dep in deps.values())
    status = "ready" if ready else "degraded"
    code = 200 if ready else 503
    return JSONResponse(
        status_code=code,
        content={"status": status, "dependencies": deps},
    )


@app.get("/api/health/dependencies", summary="Dependency status", tags=["Health"])
async def health_dependencies():
    deps = await _dependency_snapshot()
    return {"dependencies": deps}


@app.post(
    "/api/job-match",
    summary="Hybrid ATS job-match analysis (recruiter-facing)",
    response_model=FinalATSAnalysisSchema,
    tags=["Recruiter ATS"],
    responses={
        400: {"model": ErrorResponseSchema, "description": "Validation error"},
        429: {"model": ErrorResponseSchema, "description": "Rate limited"},
        500: {"model": ErrorResponseSchema, "description": "Processing failure"},
    },
)
async def job_match(req: JobMatchRequestSchema, request: Request, response: Response):
    """
    Recruiter-facing hybrid ATS endpoint.

    This endpoint does NOT affect the existing upload/search pipelines.
    It runs the hybrid ATS workflow for a provided resume_text and job description:

      parse → rule-based score → embedding similarity → Gemini reasoning → aggregate

    Returns a validated schema response containing:
      - final ATS score + layer scores
      - rule-based breakdown (including missing required skills)
      - embedding similarity breakdown
      - reasoning: strengths, weaknesses, recommendation
      - parsed resume (optional; currently included for downstream readiness)
    """
    start = time.perf_counter()
    # Request/workflow IDs for tracing (safe to expose to recruiters)
    # Use standard header if caller provides it; otherwise generate.
    # Note: kept simple (no middleware changes) to avoid impacting existing routes.
    request_id = request.headers.get("x-request-id") or request.headers.get("x-correlation-id")
    if request_id:
        request_id = str(request_id)[:128]
    else:
        request_id = f"req_{uuid.uuid4().hex}"
    workflow_id = f"wf_{uuid.uuid4().hex}"
    try:
        settings: Settings = getattr(request.app.state, "settings", get_settings())
        # Optional API key auth (enabled only if RECRUITER_API_KEYS set)
        api_keys = parse_api_keys(settings.recruiter_api_keys)
        require_api_key(request.headers.get("x-api-key"), api_keys)

        logger.info(
            "POST /api/job-match — start (required_skills=%d preferred_skills=%d required_keywords=%d)",
            len(req.required_skills or []),
            len(req.preferred_skills or []),
            len(req.required_keywords or []),
        )

        result = await _job_match_workflow.run(req)

        # Add recruiter-friendly derived fields without duplicating scoring logic:
        # - matched skills are a pure set operation from structured outputs.
        required = {s.strip().lower() for s in (req.required_skills or []) if s and s.strip()}
        resume_skills = {
            s.strip().lower()
            for s in ((result.parsed_resume.skills if result.parsed_resume else []) or [])
            if s and s.strip()
        }
        matched = sorted(list(required & resume_skills))

        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.info(
            "POST /api/job-match — done (workflow_id=%s final=%d rule=%d emb=%d conf=%d) in %dms",
            workflow_id,
            result.final_ats_score,
            result.rule_score,
            result.embedding_score,
            result.llm_confidence_score,
            elapsed_ms,
        )

        # Enrich response with recruiter-friendly derived fields (schema-supported).
        result.rule_breakdown.matched_required_skills = matched
        result.processing_ms = elapsed_ms
        result.workflow_id = workflow_id
        result.request_id = request_id
        # Ensure stage timings include total
        result.stage_timings_ms = result.stage_timings_ms or {}
        result.stage_timings_ms["total_ms"] = elapsed_ms
        response.headers["X-API-Version"] = "legacy"
        response.headers["X-Workflow-Version"] = "job_match_workflow_v1"
        response.headers["Deprecation"] = "true"
        response.headers["Link"] = '</api/v1/job-match>; rel="successor-version"'

        return result

    except HTTPException:
        raise
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.error(
            "POST /api/job-match — failed (workflow_id=%s) in %dms: %s",
            workflow_id,
            elapsed_ms,
            exc,
        )
        raise HTTPException(
            status_code=500,
            detail="Job match analysis failed. Please retry or contact support.",
        )


# ---------------------------------------------------------------------------
# API versioning: v1 routes (do not break existing /api/* clients)
# ---------------------------------------------------------------------------

@app.post(
    "/api/v1/job-match",
    summary="Hybrid ATS job-match analysis (v1)",
    response_model=FinalATSAnalysisSchema,
    tags=["Recruiter ATS"],
    responses={
        400: {"model": ErrorResponseSchema, "description": "Validation error"},
        401: {"model": ErrorResponseSchema, "description": "Unauthorized"},
        429: {"model": ErrorResponseSchema, "description": "Rate limited"},
        500: {"model": ErrorResponseSchema, "description": "Processing failure"},
    },
)
async def job_match_v1(req: JobMatchRequestSchema, request: Request, response: Response):
    resp = await job_match(req, request, response)
    resp.stage_timings_ms = resp.stage_timings_ms or {}
    response.headers["X-API-Version"] = "v1"
    response.headers["X-Workflow-Version"] = "job_match_workflow_v1"
    return resp


@app.get("/api/metrics", summary="Prometheus metrics", tags=["Health"])
def metrics():
    data = generate_latest()
    return FastAPIResponse(content=data, media_type=CONTENT_TYPE_LATEST)


@app.get("/api/system/config-safe", summary="Non-sensitive runtime config", tags=["Health"])
async def config_safe(request: Request):
    settings: Settings = getattr(request.app.state, "settings", get_settings())
    return {
        "environment": settings.environment,
        "app_name": settings.app_name,
        "llm_enabled": settings.llm_enabled,
        "gemini_model": settings.gemini_model,
        "cache_backend": settings.cache_backend,
        "cache_namespace": settings.cache_namespace,
        "prometheus_metrics_enabled": settings.prometheus_metrics_enabled,
        "otel_enabled": settings.otel_enabled,
        "rate_limits_per_min": {
            "job_match": settings.rate_limit_job_match_per_min,
            "batch": settings.rate_limit_batch_per_min,
            "process": settings.rate_limit_process_per_min,
            "search": settings.rate_limit_search_per_min,
        },
        "timeouts_s": {
            "job_match": settings.request_timeout_job_match_s,
            "batch": settings.request_timeout_batch_s,
            "process": settings.request_timeout_process_s,
            "search": settings.request_timeout_search_s,
        },
    }


@app.post(
    "/api/job-match/batch",
    summary="Batch hybrid ATS ranking (recruiter-facing)",
    response_model=BatchRankingResponseSchema,
    tags=["Recruiter ATS"],
    responses={
        400: {"model": ErrorResponseSchema, "description": "Validation error"},
        413: {"model": ErrorResponseSchema, "description": "Payload too large"},
        429: {"model": ErrorResponseSchema, "description": "Rate limited"},
        500: {"model": ErrorResponseSchema, "description": "Processing failure"},
    },
)
async def job_match_batch(req: BatchRankingRequestSchema, request: Request):
    """
    Recruiter-facing batch ATS endpoint for ranking multiple resumes
    against a single job description.
    """
    start = time.perf_counter()
    request_id = request.headers.get("x-request-id") or request.headers.get("x-correlation-id")
    if request_id:
        request_id = str(request_id)[:128]
    else:
        request_id = f"req_{uuid.uuid4().hex}"

    try:
        logger.info(
            "POST /api/job-match/batch — start (candidates=%d required_skills=%d)",
            len(req.resumes or []),
            len(req.required_skills or []),
        )
        settings: Settings = getattr(request.app.state, "settings", Settings())
        if len(req.resumes or []) > settings.max_batch_resumes:
            raise RecruiterValidationError("Batch size exceeds configured limit.")

        workflow: BatchJobMatchWorkflow = request.app.state.batch_workflow
        result = await workflow.run(req, request_id=request_id)

        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.info(
            "POST /api/job-match/batch — done (workflow_id=%s candidates=%d failed=%d) in %dms",
            result.processing_summary.workflow_id,
            result.total_candidates,
            len(result.processing_summary.failed_candidates or []),
            elapsed_ms,
        )

        workflow_trace_service.record_trace(
            workflow_id=result.processing_summary.workflow_id or "",
            request_id=request_id,
            payload={
                "request_id": request_id,
                "workflow_id": result.processing_summary.workflow_id,
                "graph_id": result.processing_summary.graph_id,
                "node_timings_ms": result.processing_summary.node_timings_ms,
                "retry_counts": result.processing_summary.retry_counts,
                "failed_candidates": result.processing_summary.failed_candidates,
                "processing_time_ms": result.processing_time_ms,
                "ranking_trace": result.processing_summary.ranking_trace,
            },
        )

        return result
    except HTTPException:
        raise
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.error(
            "POST /api/job-match/batch — failed in %dms: %s",
            elapsed_ms,
            exc,
        )
        raise HTTPException(
            status_code=500,
            detail="Batch job match analysis failed. Please retry or contact support.",
        )
