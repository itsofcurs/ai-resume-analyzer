# Phase 5: Security Hardening Report

**Date:** June 3, 2026

## 1. Action Items Completed

### Node.js Gateway (`backend-node`)
- **Package Installation**: Added `helmet` and `express-rate-limit` for fundamental API protection.
- **Global API Protection**: Applied `helmet()` in `server.ts` to automatically inject standard security headers (HSTS, NoSniff, XSS protection, etc.).
- **Strict CORS Policy**: Removed wildcard `cors({ origin: '*' })` from both Express and Socket.io. Configured CORS to dynamically use `process.env.FRONTEND_URL`, falling back safely to `http://localhost:5174`.
- **Global Rate Limiting**: Added a standard rate limiter (`100 requests / 15 mins`) to the base `/api` routing path to prevent general application abuse.
- **Auth-Specific Rate Limiting**: Added an aggressive `authLimiter` (`10 requests / 15 mins`) strictly on `POST /api/auth/login` and `POST /api/auth/register` endpoints to thwart brute-forcing and credential stuffing attacks.

### AI Microservice (`ai-service` / FastAPI)
- **Internal API Key Middleware**: Introduced an `INTERNAL_API_KEY` configuration in `core/config.py`.
- **Request Guard Enforcement**: Modified `request_guard` middleware in `main.py`. It now enforces that all inbound requests to `/api/*` (except health checks) must provide a valid `X-Internal-API-Key` matching the environment's internal key.
- **Node-to-FastAPI Proxy**: Modified Axios calls in `resumes.ts` (webhook trigger) and `copilot.ts` (semantic search proxy) within the Node gateway to actively inject `X-Internal-API-Key` using `process.env.INTERNAL_API_KEY`, securing the microservice layer from unauthorized direct access.

## 2. Environment Variables Required

For production deployment, the following new environment variables must be injected into the respective environments:

**Backend Node (`.env`)**
```env
FRONTEND_URL=https://your-production-domain.com
INTERNAL_API_KEY=your_secure_random_string
```

**AI Service (`.env`)**
```env
INTERNAL_API_KEY=your_secure_random_string
```

## 3. Next Steps
- Implement CSRF tokens for web clients if cookie-based sessions are ever adopted.
- Regular audits on NPM packages utilizing `npm audit` inside CI/CD (Phase 9).
