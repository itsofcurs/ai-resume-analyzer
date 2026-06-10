# TalentAI System Architecture

## Core Components
1. **Frontend (Vite/React)**: Serves the tenant dashboards, candidate management UI, and onboarding wizards. Uses Redux for state and React Router.
2. **Backend (Node/Express)**: Handles business logic, auth, tenant routing, and Prisma ORM interactions. Pushes jobs to BullMQ.
3. **AI Service (Python/FastAPI)**: Worker layer that consumes queue items, communicates with LLMs via LangChain/OpenRouter, and calculates semantic scores.
4. **Data Layer (PostgreSQL & MongoDB)**: Relational data (users, tenants, billing) in Postgres, document data (raw resumes, embeddings) in MongoDB/Chroma.
5. **Observability**: Prometheus metrics mapped to Grafana. Audit logs written to `AuditLog` table.

## Data Flow (Candidate Upload)
1. User uploads PDF via Frontend.
2. Backend API routes PDF to S3/MongoDB and queues a `process_resume` job in Redis (BullMQ).
3. AI Service worker picks up job, extracts text, calls LLM for structural parsing, and calculates alignment score against the `JobDescription`.
4. AI Service writes payload back to backend webhook or DB directly.
5. Frontend updates via WebSockets or polling.
