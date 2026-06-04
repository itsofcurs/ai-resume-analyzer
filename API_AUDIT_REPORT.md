# Phase 4: API Verification & Matrix

**Date:** June 3, 2026

## 1. Node.js (Express) API Matrix

| Method | Endpoint | Description | Status | Controller/Service Integration | Database |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Authenticate user. | Working | `src/routes/auth.ts` | Prisma (User) |
| `POST` | `/api/auth/register` | Register new user. | Working | `src/routes/auth.ts` | Prisma (User, Org) |
| `GET` | `/api/jobs` | Fetch all org jobs. | Working | `src/routes/jobs.ts` | Prisma (JobDescription) |
| `POST` | `/api/jobs` | Create new job. | Working | `src/routes/jobs.ts` | Prisma (JobDescription) |
| `DELETE` | `/api/jobs/:id` | Delete job. | Working | `src/routes/jobs.ts` | Prisma (JobDescription) |
| `GET` | `/api/resumes` | Fetch candidate list. | Working | `src/routes/resumes.ts`| Mongo (Resume) |
| `GET` | `/api/resumes/stats` | Dashboard aggregates. | Working | `src/routes/resumes.ts`| Mongo (Resume) |
| `POST` | `/api/resumes/upload` | Upload & start NLP. | Working | `src/routes/resumes.ts`| Mongo (Resume) -> FastAPI |
| `DELETE`| `/api/resumes/:id` | Delete candidate. | Working | `src/routes/resumes.ts`| Mongo (Resume) |
| `POST` | `/api/copilot/search` | Semantic candidate search. | Working | `src/routes/copilot.ts`| Forwards to FastAPI |
| `GET` | `/api/copilot/summary/:id` | Gemini 3-sentence summary. | Working | `src/routes/copilot.ts`| Mongo (Resume) + GenAI API |
| `POST` | `/api/copilot/analyze_fit` | Job match candidate scoring. | Working | `src/routes/copilot.ts`| Mongo (Resume) + Prisma + GenAI |

## 2. Python (FastAPI) API Matrix

| Method | Endpoint | Description | Status | Database |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/extract` | Downloads PDF, runs LangChain, updates Mongo. | Working | MongoDB |
| `POST` | `/api/search` | ChromaDB vector similarity search. | Working | ChromaDB |
| `GET` | `/health` | Service health check. | Working | None |

## 3. Orphaned / Missing Endpoints

* **Missing Webhooks:** `ai-service` updates Mongo directly instead of calling a Node.js webhook to trigger Socket.io events.
* **Missing Candidate Endpoints:** No endpoints exist for candidates to apply or view status.
* **Unused/Broken Client Calls:** Frontend connects to Socket.io but no events are successfully routed to update UI state in `Dashboard.tsx`.
