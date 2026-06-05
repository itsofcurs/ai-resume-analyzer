# INTERVIEW AGENT — ARCHITECTURE INSPECTION & IMPLEMENTATION PLAN

> **Report Type:** Architecture Inspection  
> **Scope:** Interview Question Generator Agent  
> **Date:** 2026-06-05  
> **Author:** Principal Staff AI Architect  
> **Codebase Version:** `main` @ `77385c0`

---

## Table of Contents

1. [Architecture Inventory](#1-architecture-inventory)
2. [A — Exact Reusable Components](#a-exact-reusable-components)
3. [B — Existing Modules to Extend](#b-existing-modules-to-extend)
4. [C — Files That Must Be Modified](#c-files-that-must-be-modified)
5. [D — Files That Must NOT Be Modified](#d-files-that-must-not-be-modified)
6. [E — Recommended Workflow Location](#e-recommended-workflow-location)
7. [F — Existing Graph Patterns to Reuse](#f-existing-graph-patterns-to-reuse)
8. [G — Existing Prompt Architecture](#g-existing-prompt-architecture)
9. [H — Existing Mongo Structures for Interview Data](#h-existing-mongo-structures-for-interview-data)
10. [I — Existing React Components for Interview Questions](#i-existing-react-components-for-interview-questions)
11. [J — Complete Implementation Strategy](#j-complete-implementation-strategy)

---

## 1. Architecture Inventory

### 1.1 Current LangGraph Workflows

| Workflow | File | State Type | Nodes | Pattern |
|---|---|---|---|---|
| **ResumeWorkflow** | `workflows/resume_workflow.py` | `ResumeState` (TypedDict) | 8 nodes | Linear pipeline with conditional error edges |
| **InterviewQuestionGraph** | `workflows/interview_workflow.py` | `InterviewState` (TypedDict) | 7 nodes | Linear pipeline with conditional error edges |
| **CopilotWorkflow** | `workflows/copilot_workflow.py` | `CopilotState` (TypedDict) | 7 nodes | Intent router → tool dispatch → response generation |
| **RecommendationWorkflow** | `workflows/recommendation_workflow.py` | (TypedDict) | Multiple | Vector search → LLM ranking |
| **ComparisonWorkflow** | `workflows/comparison_workflow.py` | (TypedDict) | Multiple | Fetch two candidates → LLM compare |
| **JobMatchWorkflow** | `workflows/job_match_workflow.py` | (TypedDict) | Multiple | Resume vs. JD scoring |
| **BatchJobMatchWorkflow** | `workflows/batch_job_match_workflow.py` | (TypedDict) | Multiple | Batched JD matching |

**Key observation:** Every workflow follows the same class-based pattern:
- `__init__` builds a `StateGraph`, adds nodes, sets entry point, adds conditional edges, calls `.compile()`
- Nodes are instance methods `async def _node_xxx(self, state) -> state`
- Error routing uses `lambda state: "handle_failure" if state.get("error") else "next_node"`
- A public `async def run(...)` method creates `initial_state` and calls `self._graph.ainvoke()`

---

### 1.2 Existing State Schemas (TypedDict)

| State | File | Fields |
|---|---|---|
| `ResumeState` | `resume_workflow.py:46` | `resume_id`, `cloudinary_url`, `filename`, `raw_text`, `parsed`, `vector`, `vector_stored`, `ats_scores`, `ranking`, `error` |
| `InterviewState` | `interview_workflow.py:24` | `resume_id`, `parsed_data`, `technical_questions`, `project_questions`, `behavioral_questions`, `follow_up_questions`, `error` |
| `CopilotState` | `copilot_workflow.py:76` | `query`, `intent`, `tool_data`, `response`, `error` |

**Pattern:** All use `TypedDict` with `Optional` fields. Error is always `Optional[str]`.

---

### 1.3 Existing Pydantic Models

| Model | File | Purpose |
|---|---|---|
| `ResumeParseResponse` | `schemas/resume_schema.py:102` | Full resume extraction output (name, email, phone, skills, experience, education, projects, authenticity audit) |
| `ExperienceSchema` | `schemas/resume_schema.py:28` | Work experience entry |
| `EducationSchema` | `schemas/resume_schema.py:51` | Education entry |
| `ProjectSchema` | `schemas/resume_schema.py:74` | Project entry |
| `StandaloneATSScoreSchema` | `schemas/ats_ranking_schema.py:19` | Upload-time ATS score breakdown |
| `CandidateRankingResultSchema` | `schemas/ats_ranking_schema.py:53` | Grade/Tier/Priority classification |
| `InterviewQuestionsSchema` | `schemas/interview_schema.py:20` | Container for all question types |
| `TechnicalQuestion` | `schemas/interview_schema.py:4` | `question`, `skill`, `difficulty` |
| `ProjectQuestion` | `schemas/interview_schema.py:9` | `question`, `project` |
| `BehavioralQuestion` | `schemas/interview_schema.py:13` | `question` |
| `FollowUpQuestion` | `schemas/interview_schema.py:16` | `question`, `parentQuestion` |
| `JobMatchRequestSchema` | `schemas/job_match_schema.py` | JD matching request |
| `FinalATSAnalysisSchema` | `schemas/job_match_schema.py` | JD match result |
| `BatchRankingRequestSchema` | `schemas/ranking_schema.py` | Batch ranking request |
| `WorkflowEventSchema` | `schemas/workflow_event_schema.py` | Workflow lifecycle events |
| `ErrorResponseSchema` | `schemas/error_schema.py` | Standard error envelope |

**Key finding:** `InterviewQuestionsSchema` and all 4 question sub-models **already exist** and are **production-ready**. No new Pydantic models are needed.

---

### 1.4 Existing Gemini Wrappers

| Component | File | Purpose |
|---|---|---|
| `GeminiService` (singleton) | `services/gemini_service.py` | Manages shared `ChatGoogleGenerativeAI` instance. Lazy init, env-driven config, health check. |
| `GeminiServiceError` | `services/gemini_service.py:40` | Custom exception for LLM init failures |

**Access pattern:** `GeminiService.get_instance().get_llm()` returns the LangChain LLM.

**Critical constraint:** `ChatGoogleGenerativeAI` is a **Pydantic model** — you CANNOT monkey-patch `.invoke` or `.ainvoke`. The recent production outage (`"ChatGoogleGenerativeAI" object has no field "invoke"`) was caused by violating this constraint.

**Rate limit note:** Gemini free tier = 20 requests/min. The `gemini_max_retries` config (default 3) handles SDK-level retries. Application-level retries use `utils/retry_utils.py::ainvoke_with_retry()`.

---

### 1.5 Existing AI Agents

| Agent | File | Architecture | Used By |
|---|---|---|---|
| `ResumeParserAgent` | `agents/resume_parser.py` | LCEL chain (`prompt \| llm \| StrOutputParser()`) | `resume_workflow.py` |
| `InterviewPreparationAgent` | `agents/interview_agent.py` | LangChain `AgentExecutor` with tool-calling | **NOT WIRED TO ANY WORKFLOW** |
| `ATSScorerAgent` (implied) | `agents/ats_scorer.py` | Direct LLM scoring | `resume_workflow.py` |
| `CandidateGuidanceAgent` | `agents/candidate_guidance.py` | Chat-based agent | Standalone |
| `RecruiterCopilotAgent` | `agents/recruiter_copilot.py` | Chat-based agent | `copilot_workflow.py` |

**Critical finding:** `agents/interview_agent.py` exists but is a **different architecture** from the current `interview_workflow.py`:
- The agent uses `AgentExecutor` + tool calling (older LangChain pattern)
- The workflow uses direct LCEL chains inside LangGraph nodes
- The agent requires a `job_description` input; the workflow does not
- **The agent is NOT imported or used anywhere in the codebase** — it is dead code

---

### 1.6 Existing Prompts Folder

| Prompt | File | Template Variable | Version |
|---|---|---|---|
| `RESUME_PARSER_PROMPT` | `prompts/resume_parser_prompt.py` | `{resume_text}` | 1.0.0 |
| `ATS_SCORING_PROMPT` | `prompts/ats_scoring_prompt.py` | `{resume_json}` | 1.0.0 |
| `ATS_REASONING_PROMPT` | `prompts/ats_reasoning_prompt.py` | varies | 1.0.0 |
| `CANDIDATE_RANKING_PROMPT` | `prompts/candidate_ranking_prompt.py` | `{resume_json}` | 1.0.0 |

**Pattern:** Each prompt file:
- Exports a `PROMPT_VERSION` string
- Exports a `PromptTemplate` (or `PromptTemplate.from_template()`)
- Uses `{variable_name}` placeholder syntax
- Instructions request ONLY valid JSON output, no markdown fences

**Missing:** There is no `prompts/interview_prompt.py`. The 4 interview prompts (`TECHNICAL_PROMPT`, `PROJECT_PROMPT`, `BEHAVIORAL_PROMPT`, `FOLLOWUP_PROMPT`) are **hardcoded inline** inside `interview_workflow.py:33-98`. This violates the established separation pattern.

---

### 1.7 Existing Mongo Structures

The **single MongoDB collection** is `talentdb.resumes`.

**Mongoose schema** (`backend-node/src/models/Resume.ts`):

| Field | Type | Purpose |
|---|---|---|
| `filename` | String (required) | Original resume filename |
| `cloudinaryUrl` | String | Cloud storage URL |
| `candidateName` | String | Extracted name |
| `candidateEmail` | String | Extracted email |
| `candidatePhone` | String | Extracted phone |
| `rawText` | String (required) | Full resume text |
| `status` | Enum String | `PENDING → EXTRACTING → ANALYZING → SCORING → RANKING → PROCESSED → FAILED` |
| `parsedData` | Mixed | `{name, email, phone, skills}` |
| `aiAnalysis` | Mixed | `{authenticity_score, ai_generated_probability, red_flags, technical_depth_score, experience[], education[], projects[]}` |
| `embeddingsId` | String | Vector DB reference |
| `atsScores` | Mixed | `{overall_score, skill_completeness, experience_score, education_score, resume_quality}` |
| `candidateRanking` | Mixed | `{grade, tier, recruiter_recommendation, hiring_priority}` |
| `interviewQuestions` | **Mixed** | `{technicalQuestions[], projectQuestions[], behavioralQuestions[], followUpQuestions[]}` |
| `uploadedBy` | String (required) | Postgres user ID |
| `organizationId` | String (required) | Postgres org ID |
| `embedding` | Array (768 floats) | Vector search field (stored by Python service) |
| `timestamps` | Auto | `createdAt`, `updatedAt` |

**Key finding:** The `interviewQuestions` field **already exists** in both the Mongoose schema and the Python `$set` operation. The Python workflow writes via:
```python
await collection.update_one(
    {"_id": ObjectId(state["resume_id"])},
    {"$set": {"interviewQuestions": schema.model_dump()}}
)
```

---

### 1.8 Existing API Routes

#### Python (FastAPI) — `ai-service/main.py`

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/process` | Trigger resume processing pipeline |
| POST | `/api/search` | Semantic vector search |
| POST | `/api/copilot/chat` | Copilot chat |
| GET | `/api/copilot/summary/{id}` | Generate AI summary |
| POST | `/api/recruiter/job-match` | JD matching |
| POST | `/api/recruiter/batch-rank` | Batch ranking |
| GET | `/api/health` | Health check |

#### Node.js (Express) — `backend-node/src/`

| Method | Path | File | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | `routes/auth.ts` | User authentication |
| POST | `/api/auth/register` | `routes/auth.ts` | User registration |
| GET | `/api/resumes` | `routes/resumes.ts` | List resumes |
| POST | `/api/resumes/upload` | `routes/resumes.ts` | Upload + trigger processing |
| DELETE | `/api/resumes/:id` | `routes/resumes.ts` | Delete resume |
| POST | `/api/resumes/webhook/status` | `routes/resumes.ts` | Python→Node status webhook |
| GET | `/api/interview/:candidateId` | `routes/interview.ts` | **Fetch interview questions** |
| POST | `/api/interview/webhook/event` | `routes/interview.ts` | **Python→Node interview event webhook** |
| POST | `/api/copilot/chat` | `routes/copilot.ts` | Copilot proxy to Python |
| GET | `/api/copilot/summary/:id` | `routes/copilot.ts` | Summary proxy to Python |
| GET | `/api/jobs` | `routes/jobs.ts` | List jobs |

**Key finding:** The interview routes **already exist and are mounted** at `/api/interview` in `server.ts:73`.

---

### 1.9 Existing Socket.IO Events

| Event Name | Direction | Source | Purpose |
|---|---|---|---|
| `resume_status_update` | Server → Client | `routes/resumes.ts:23` | Resume processing status change |
| `QUESTION_GENERATION_STARTED` | Server → Client | `routes/interview.ts:24` | Interview generation started |
| `QUESTION_GENERATION_COMPLETED` | Server → Client | `routes/interview.ts:24` | Interview generation finished |
| `QUESTION_GENERATION_FAILED` | Server → Client | `routes/interview.ts:24` | Interview generation failed |

**Pattern:** Python → Node webhook → `io.emit(event, {candidateId})` → React frontend `socket.on(event)`.

---

### 1.10 Existing Frontend Recruiter Dashboard

| Component | File | Purpose |
|---|---|---|
| `Candidates` (page) | `pages/Candidates.tsx` (740 lines) | Main candidate list + detail modal with **Overview** and **Interview Preparation** tabs |
| `Dashboard` (page) | `pages/Dashboard.tsx` (30KB) | Analytics overview |
| `Jobs` (page) | `pages/Jobs.tsx` (24KB) | Job management |
| `Login` (page) | `pages/Login.tsx` | Authentication |
| `CopilotPanel` | `components/CopilotPanel.tsx` | Floating AI chat panel |
| `SemanticSearchWidget` | `components/SemanticSearchWidget.tsx` | Search UI widget |
| `RecommendedCandidates` | `components/RecommendedCandidates.tsx` | Candidate cards |
| `AgentVisualizer` | `components/AgentVisualizer.tsx` | Agent workflow visualizer |
| `Layout` | `components/Layout.tsx` | App shell / sidebar |

**Candidates.tsx already implements:**
- `activeTab` state: `'overview' | 'interview'`
- `interviewQuestions` state: `any` (stores fetched questions)
- `questionStatus` state: `'pending' | 'generating' | 'completed' | 'failed'`
- `fetchInterviewQuestions(id)`: GET `/api/interview/:id`
- Socket.IO listeners for `QUESTION_GENERATION_*` events
- Full rendering for all 4 question types (Technical, Project, Behavioral, Follow-up)
- "Generating" spinner, "Failed" error state, and "No questions yet" fallback

---

## A — Exact Reusable Components

| Component | Location | How to Reuse |
|---|---|---|
| `GeminiService.get_instance().get_llm()` | `services/gemini_service.py` | All LLM calls go through this singleton |
| `ainvoke_with_retry(chain, input_dict)` | `utils/retry_utils.py` | Wraps any LCEL chain call with exponential backoff |
| `clean_json_str(raw)` | `utils/parser_utils.py` | Strips markdown fences from LLM JSON output |
| `get_mongo_collection()` | `database.py` | Returns the `resumes` async Motor collection |
| `PromptTemplate.from_template()` | LangChain | Standard prompt construction pattern |
| `StrOutputParser()` | LangChain | Standard output parser for LCEL chains |
| `StateGraph` / `END` | LangGraph | Graph construction primitives |
| `InterviewQuestionsSchema` | `schemas/interview_schema.py` | Pydantic model for the full question set |
| `TechnicalQuestion`, `ProjectQuestion`, `BehavioralQuestion`, `FollowUpQuestion` | `schemas/interview_schema.py` | Individual question models |
| Socket.IO webhook pattern | `interview_workflow.py:144` | `_emit_event()` → Node webhook → `io.emit()` |

---

## B — Existing Modules to Extend

| Module | Extension Needed |
|---|---|
| `prompts/` directory | Extract the 4 inline prompts from `interview_workflow.py` into a new `prompts/interview_prompt.py` to follow the established pattern |
| `schemas/__init__.py` | Add `InterviewQuestionsSchema` and sub-models to `__all__` exports |
| `workflows/__init__.py` | Add `InterviewQuestionGraph` to exports |

---

## C — Files That Must Be Modified

| File | Modification | Reason |
|---|---|---|
| `workflows/interview_workflow.py` | Move inline prompts to `prompts/interview_prompt.py`; import them back | Aligns with established prompt architecture |
| `schemas/__init__.py` | Add interview schema exports | Discoverability, consistency |
| `workflows/__init__.py` | Add `InterviewQuestionGraph` export | Consistency with other workflow exports |

---

## D — Files That Must NOT Be Modified

| File | Reason |
|---|---|
| `workflows/resume_workflow.py` | Working pipeline. Interview trigger at line 337 (`asyncio.create_task`) already works correctly |
| `services/gemini_service.py` | Just fixed. `ChatGoogleGenerativeAI` is Pydantic — NEVER monkey-patch attributes on it |
| `schemas/resume_schema.py` | Stable extraction contract. No interview data belongs here |
| `schemas/ats_ranking_schema.py` | Unrelated scoring schemas |
| `agents/resume_parser.py` | Stable extraction agent |
| `database.py` | Connection layer is stable. Interview data is stored via standard `collection.update_one()` |
| `backend-node/src/models/Resume.ts` | `interviewQuestions: Mixed` already exists |
| `backend-node/src/routes/interview.ts` | GET and webhook routes already work |
| `backend-node/src/server.ts` | Already mounts `/api/interview` at line 73 |
| `prompts/resume_parser_prompt.py` | Unrelated extraction prompt |
| `prompts/ats_scoring_prompt.py` | Unrelated scoring prompt |
| `prompts/candidate_ranking_prompt.py` | Unrelated ranking prompt |
| All frontend files | Interview tab UI in `Candidates.tsx` is already complete and functional |

---

## E — Recommended Workflow Location

**Existing:** `ai-service/workflows/interview_workflow.py`

This is the correct and final location. The workflow is already:
- A LangGraph `StateGraph` with `InterviewState`
- Wired into the resume pipeline via `asyncio.create_task` in `resume_workflow.py:337`
- Connected to the frontend via Socket.IO webhooks
- Persisting results to MongoDB via `collection.update_one()`

**No new workflow file is needed.** The existing `interview_workflow.py` IS the Interview Question Generator Agent.

---

## F — Existing Graph Patterns to Reuse

### Pattern 1: Linear Pipeline with Error Short-Circuit (ResumeWorkflow)

```
entry → node_a → [error?] → handle_failure
                  [ok?]   → node_b → [error?] → handle_failure
                                      [ok?]   → node_c → ... → END
```

**Used by:** `ResumeWorkflow`, `InterviewQuestionGraph`  
**Implementation:** `graph.add_conditional_edges("node", lambda state: "handle_failure" if state.get("error") else "next_node")`

### Pattern 2: Intent Router (CopilotWorkflow)

```
entry → detect_intent → [search]    → tool_search    → generate_response → END
                       → [recommend] → tool_recommend → generate_response → END
                       → [compare]   → tool_compare   → generate_response → END
                       → [chat]      → tool_chat      → generate_response → END
```

**Used by:** `CopilotWorkflow`

### Pattern 3: Background Trigger (ResumeWorkflow → InterviewQuestionGraph)

```python
# In resume_workflow.py:337 — fire-and-forget after pipeline completes
asyncio.create_task(InterviewQuestionGraph().run(resume_id))
```

### Pattern 4: Webhook Event Emission

```python
async def _emit_event(self, resume_id: str, event_name: str):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{settings.node_backend_url}/api/interview/webhook/event",
            json={"id": resume_id, "event": event_name},
            headers={"x-api-key": settings.internal_api_key},
            timeout=2.0
        )
```

### Pattern 5: LCEL Chain with Retry

```python
llm = GeminiService.get_instance().get_llm()
chain = PROMPT | llm | StrOutputParser()
raw = await ainvoke_with_retry(chain, {"input_var": value})
cleaned = clean_json_str(raw)
data = json.loads(cleaned)
result = PydanticModel(**data)
```

---

## G — Existing Prompt Architecture

### Established Convention

| Aspect | Convention |
|---|---|
| **File location** | `prompts/{feature}_prompt.py` |
| **Version tracking** | `PROMPT_VERSION = "1.0.0"` constant |
| **Template construction** | `PromptTemplate.from_template("""...""")` |
| **Variable syntax** | `{variable_name}` with double-brace escaping `{{` for literal JSON |
| **Output instruction** | "Return ONLY valid JSON, no markdown fences, no explanation" |
| **Schema documentation** | JSON schema example embedded in prompt text |
| **Naming** | `SCREAMING_SNAKE_CASE` for the exported constant |

### Current Violation in interview_workflow.py

The 4 interview prompts (`TECHNICAL_PROMPT`, `PROJECT_PROMPT`, `BEHAVIORAL_PROMPT`, `FOLLOWUP_PROMPT`) at lines 33–98 are **defined inline** in the workflow file. Every other prompt in the codebase lives in a dedicated file under `prompts/`.

**Recommendation:** Extract to `prompts/interview_prompt.py` with a `PROMPT_VERSION` constant.

---

## H — Existing Mongo Structures for Interview Data

### Current Storage

The `interviewQuestions` field on the `resumes` collection document stores:

```json
{
  "interviewQuestions": {
    "technicalQuestions": [
      { "question": "...", "skill": "...", "difficulty": "Easy|Medium|Hard" }
    ],
    "projectQuestions": [
      { "question": "...", "project": "..." }
    ],
    "behavioralQuestions": [
      { "question": "..." }
    ],
    "followUpQuestions": [
      { "question": "...", "parentQuestion": "..." }
    ]
  }
}
```

### Write Path (Python)

```python
# interview_workflow.py:240-253
schema = InterviewQuestionsSchema(
    technicalQuestions=state["technical_questions"],
    projectQuestions=state["project_questions"],
    behavioralQuestions=state["behavioral_questions"],
    followUpQuestions=state["follow_up_questions"],
)
await collection.update_one(
    {"_id": ObjectId(state["resume_id"])},
    {"$set": {"interviewQuestions": schema.model_dump()}}
)
```

### Read Path (Node.js)

```typescript
// routes/interview.ts:31-41
const resume = await Resume.findOne({ _id: candidateId, organizationId: user.organizationId });
res.json(resume.interviewQuestions || null);
```

### Read Path (Frontend)

```typescript
// Candidates.tsx:81-97
const res = await axios.get(`${API_URL}/interview/${id}`, { headers: { Authorization: `Bearer ${token}` } });
setInterviewQuestions(res.data);
```

**Conclusion:** The full read-write pipeline is already operational. No schema migration needed.

---

## I — Existing React Components for Interview Questions

### Tab System (Candidates.tsx)

| Element | Location | State |
|---|---|---|
| Tab bar | Lines ~410–430 | `activeTab: 'overview' | 'interview'` |
| Overview tab content | Lines ~432–621 | Renders when `activeTab === 'overview'` |
| Interview tab content | Lines ~623–732 | Renders when `activeTab === 'interview'` |

### Interview Tab UI States

| State | Condition | UI |
|---|---|---|
| **Generating** | `questionStatus === 'generating'` | Spinning `BrainCircuit` icon + "Generating Interview Questions" text |
| **Failed** | `questionStatus === 'failed'` | Red `ShieldAlert` icon + "Generation Failed" message |
| **Completed** | `interviewQuestions` has data | Full question cards for all 4 categories |
| **Empty** | No questions, not generating | "No interview questions generated yet." |

### Question Card Renderers

| Category | Icon | Color Theme | Fields Displayed |
|---|---|---|---|
| Technical | `BrainCircuit` | Blue | `skill` (badge), `difficulty` (color-coded badge), `question` |
| Project | `Target` | Indigo | `project` (label), `question` |
| Behavioral | `Users` | Emerald | `question` |
| Follow-up | `MessageSquare` | Purple | `parentQuestion` (italic reference), `question` |

**Conclusion:** The frontend interview UI is **100% complete**. No frontend changes needed.

---

## J — Complete Implementation Strategy

### Current State Assessment

The Interview Question Generator Agent is **already implemented across the full stack**:

| Layer | Status | Component |
|---|---|---|
| Pydantic Models | ✅ Complete | `schemas/interview_schema.py` — all 5 models |
| LangGraph Workflow | ✅ Complete | `workflows/interview_workflow.py` — 7-node pipeline |
| Retry Logic | ✅ Complete | `utils/retry_utils.py::ainvoke_with_retry()` |
| MongoDB Storage | ✅ Complete | `interviewQuestions` field on `resumes` collection |
| Background Trigger | ✅ Complete | `resume_workflow.py:337` via `asyncio.create_task` |
| Webhook Events | ✅ Complete | `_emit_event()` → Node webhook → Socket.IO |
| Node.js API Routes | ✅ Complete | `routes/interview.ts` — GET + webhook |
| Socket.IO Events | ✅ Complete | 3 events: STARTED, COMPLETED, FAILED |
| Frontend UI | ✅ Complete | Tab system + 4 question card renderers + all states |
| Prompt Separation | ❌ Violation | Prompts inline in workflow instead of `prompts/` |
| Dead Code | ⚠️ Warning | `agents/interview_agent.py` is unused dead code |

### Recommended Actions (Priority Order)

**1. Fix the Production Blocker (DONE)**
The `GeminiService` monkey-patching that crashed the LLM initialization has been reverted. The fix (commit `77385c0`) is deployed.

**2. Extract Prompts to `prompts/interview_prompt.py`**
Move the 4 inline prompts from `interview_workflow.py:33-98` into a dedicated prompt file following the established convention. Add `PROMPT_VERSION` tracking.

**3. Clean Up Dead Code**
`agents/interview_agent.py` is an orphaned `AgentExecutor`-based implementation that is never imported. It conflicts conceptually with the working LangGraph workflow. It should be deleted or archived.

**4. Export Interview Schemas**
Add `InterviewQuestionsSchema` and sub-models to `schemas/__init__.py` `__all__` list for consistency with all other schema exports.

**5. Register InterviewQuestionGraph in Workflow Exports**
Add to `workflows/__init__.py` for discoverability, matching the pattern of `ResumeWorkflow`, `JobMatchWorkflow`, and `BatchJobMatchWorkflow`.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RESUME UPLOAD                                │
│  Frontend → Node.js → Python /api/process → ResumeWorkflow.run()   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     ResumeWorkflow (LangGraph)                      │
│  extract_text → parse → embed → store → ats_score → rank → save   │
│                                                              │      │
│  On PROCESSED: asyncio.create_task(InterviewQuestionGraph.run())    │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 InterviewQuestionGraph (LangGraph)                   │
│                                                                     │
│  load_candidate ──► generate_technical ──► generate_project ──►    │
│  generate_behavioral ──► generate_followups ──► save_questions     │
│                                                      │              │
│  Each node: LCEL chain (Prompt | Gemini | StrParser)                │
│  Retry: ainvoke_with_retry(chain, {...})                            │
│  Error: state["error"] → handle_failure → emit FAILED event        │
│  Success: $set interviewQuestions → emit COMPLETED event            │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
        ┌──────────────────┐      ┌──────────────────────┐
        │   MongoDB Atlas   │      │  Node.js Webhook      │
        │   resumes.        │      │  /api/interview/      │
        │   interviewQ...   │      │  webhook/event        │
        └──────────────────┘      └──────────┬───────────┘
                                              │
                                              ▼
                                   ┌──────────────────────┐
                                   │   Socket.IO emit()   │
                                   │  QUESTION_GENERATION │
                                   │  _STARTED/_COMPLETED │
                                   │  /_FAILED            │
                                   └──────────┬───────────┘
                                              │
                                              ▼
                                   ┌──────────────────────┐
                                   │   React Frontend      │
                                   │   Candidates.tsx      │
                                   │   Interview Tab       │
                                   │   socket.on(event)    │
                                   │   → fetchQuestions()  │
                                   └──────────────────────┘
```

---

> **Final Assessment:** The Interview Question Generator Agent is architecturally complete. The recent production failure was not an architecture problem — it was a runtime bug caused by attempting to monkey-patch a Pydantic model's methods. The fix has been deployed. The remaining work is purely **housekeeping**: prompt extraction, dead code cleanup, and export registration.
