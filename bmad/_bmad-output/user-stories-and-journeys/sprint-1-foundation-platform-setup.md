# Sprint 1 — Foundation Platform Setup

**Sprint Goal:** Establish authentication, GitHub connection, database foundations, Pinecone setup, and base UI scaffolding for Share-k.
**Duration:** Week 1

---

## Feature 1: User Registration & Role Assignment

### User Story 1.1 — Register as a Project Owner

> **As a** project owner,
> **I want to** register on Share-k and choose the "Project Owner" role,
> **So that** I can publish my open-source projects and find contributors.

**Acceptance Criteria:**

- User can access a registration page with email, password, name, and role selection fields.
- Role options include "Project Owner" and "Contributor."
- After submitting the form, the user receives an email verification link.
- The account is created with status `pending` until email is verified.
- Upon email verification, the owner account status becomes `active` (after GitHub connection).
- The system stores preferred language (Arabic / English).

**Priority:** High
**Related Tasks:** TASK-1-03, TASK-1-04
**PRD References:** FR-001, NFR-004

### User Journey 1.1 — Project Owner Registration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. User lands on Share-k landing page                                      │
│    └─> Clicks "Get Started" / "Register"                                   │
│                                                                             │
│ 2. Registration Form                                                        │
│    └─> Fills in: Full Name, Email, Password, Confirm Password              │
│    └─> Selects Role: "Project Owner"                                       │
│    └─> Selects preferred language: Arabic or English                        │
│    └─> Clicks "Create Account"                                             │
│                                                                             │
│ 3. Email Verification                                                       │
│    └─> System sends verification email                                     │
│    └─> User opens email → clicks verification link                         │
│    └─> System marks email as verified                                      │
│                                                                             │
│ 4. Post-Verification Redirect                                              │
│    └─> User is redirected to the dashboard                                 │
│    └─> A banner prompts: "Connect your GitHub account to get started"      │
│                                                                             │
│ 5. Account Status                                                           │
│    └─> Status is `pending` until GitHub is connected                       │
│    └─> After GitHub connection → status becomes `active`                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### User Story 1.2 — Register as a Contributor

> **As a** contributor,
> **I want to** register on Share-k and choose the "Contributor" role,
> **So that** I can discover projects, build my skill profile, and earn reputation.

**Acceptance Criteria:**

- User can register with email, password, name, and selects the "Contributor" role.
- After email verification, the account remains in `pending` status.
- The contributor is informed that their account will become active once their AI-generated skill profile is reviewed and approved by an admin.
- System stores preferred language setting.

**Priority:** High
**Related Tasks:** TASK-1-03, TASK-1-04
**PRD References:** FR-011, FR-014

### User Journey 1.2 — Contributor Registration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. User lands on Share-k landing page                                      │
│    └─> Clicks "Get Started" / "Register"                                   │
│                                                                             │
│ 2. Registration Form                                                        │
│    └─> Fills in: Full Name, Email, Password, Confirm Password              │
│    └─> Selects Role: "Contributor"                                         │
│    └─> Selects preferred language: Arabic or English                        │
│    └─> Clicks "Create Account"                                             │
│                                                                             │
│ 3. Email Verification                                                       │
│    └─> System sends verification email                                     │
│    └─> User opens email → clicks verification link                         │
│    └─> System marks email as verified                                      │
│                                                                             │
│ 4. Post-Verification Redirect                                              │
│    └─> User is redirected to an onboarding screen                          │
│    └─> Prompt: "Connect your GitHub account to generate your skill profile"│
│                                                                             │
│ 5. Account Status                                                           │
│    └─> Status remains `pending`                                            │
│    └─> User is told: "Your account will be activated after admin reviews   │
│        your AI-generated skill profile."                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 2: GitHub OAuth Connection

### User Story 1.3 — Connect GitHub Account (Owner)

> **As a** project owner,
> **I want to** connect my GitHub account via OAuth,
> **So that** I can import repository data and publish projects on Share-k.

**Acceptance Criteria:**

- A "Connect GitHub" button is visible on the dashboard after registration.
- Clicking it initiates a GitHub OAuth flow (redirect to GitHub → authorize → callback).
- On success, the linked GitHub account ID, username, and access token are stored.
- The owner's account status transitions to `active`.
- If the OAuth flow fails or is cancelled, the user sees a clear error message and can retry.

**Priority:** High
**Related Tasks:** TASK-1-04
**PRD References:** FR-001, FR-027

### User Story 1.4 — Connect GitHub Account (Contributor)

> **As a** contributor,
> **I want to** connect my GitHub account via OAuth,
> **So that** Share-k can analyze my repositories and generate my AI skill profile.

**Acceptance Criteria:**

- After email verification, the contributor is prompted to connect GitHub.
- The OAuth flow works identically to the owner flow.
- On successful connection, the system triggers GitHub data ingestion in the background.
- The contributor is shown a loading/status indicator: "Analyzing your GitHub activity…"
- The account remains `pending` until the resulting skill profile is reviewed by an admin.

**Priority:** High
**Related Tasks:** TASK-1-04, TASK-1-05
**PRD References:** FR-011, FR-027, FR-028

### User Journey 1.3/1.4 — GitHub OAuth Connection (Both Roles)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Dashboard / Onboarding Screen                                           │
│    └─> User sees "Connect GitHub" button with GitHub logo                  │
│    └─> Clicks "Connect GitHub"                                             │
│                                                                             │
│ 2. GitHub OAuth Redirect                                                    │
│    └─> Browser redirects to github.com/login/oauth/authorize               │
│    └─> User reviews permissions requested by Share-k                       │
│    └─> User clicks "Authorize Share-k"                                     │
│                                                                             │
│ 3. OAuth Callback                                                           │
│    └─> GitHub redirects back to Share-k with authorization code            │
│    └─> Backend exchanges code for access token                             │
│    └─> System stores: github_user_id, github_username, access_token        │
│    └─> Short-lived OAuth state record is cleaned up                        │
│                                                                             │
│ 4a. Owner Path                                                              │
│    └─> Account status → `active`                                           │
│    └─> Redirect to dashboard with success toast: "GitHub connected!"       │
│    └─> Dashboard now shows "Publish a Project" CTA                         │
│                                                                             │
│ 4b. Contributor Path                                                        │
│    └─> System triggers GitHub data ingestion (background job)              │
│    └─> UI shows: "Analyzing your GitHub activity… This may take a moment." │
│    └─> Account remains `pending`                                           │
│    └─> After ingestion completes → skill profile is generated (Sprint 3)   │
│                                                                             │
│ 5. Error Handling                                                           │
│    └─> If user denies OAuth → "GitHub connection cancelled. Try again."    │
│    └─> If network error → "Connection failed. Please retry."              │
│    └─> If token exchange fails → log error, show generic retry message     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 3: Login & Session Management

### User Story 1.5 — Login to Share-k

> **As a** registered user (owner, contributor, or admin),
> **I want to** log in with my email and password,
> **So that** I can access my role-appropriate dashboard and features.

**Acceptance Criteria:**

- Login form accepts email and password.
- On success, the system creates an auth session and returns access + refresh tokens.
- The user is redirected to their role-specific dashboard.
- If the account is `suspended` or `deactivated`, login is rejected with a clear message.
- If the account is `pending`, the user can log in but sees a limited onboarding view.
- Invalid credentials show: "Incorrect email or password."

**Priority:** High
**Related Tasks:** TASK-1-04
**PRD References:** FR-001, FR-011

### User Journey 1.5 — User Login

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. User navigates to Share-k login page                                    │
│    └─> Enters Email and Password                                           │
│    └─> Clicks "Log In"                                                     │
│                                                                             │
│ 2. Authentication Check                                                     │
│    └─> Backend validates credentials                                       │
│    └─> If valid → create auth session (access token + refresh token)       │
│    └─> If invalid → "Incorrect email or password."                         │
│                                                                             │
│ 3. Account Status Check                                                     │
│    ├─> `active` → redirect to full dashboard                               │
│    ├─> `pending` → redirect to onboarding/limited view                     │
│    ├─> `suspended` → "Your account has been suspended. Contact support."   │
│    └─> `deactivated` → "This account is no longer active."                 │
│                                                                             │
│ 4. Session Persistence                                                      │
│    └─> Access token used for API requests                                  │
│    └─> Refresh token used to renew expired access tokens                   │
│    └─> Session recorded in auth_session table                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 4: GitHub Data Ingestion Service

### User Story 1.6 — Fetch GitHub Repository Data

> **As the** system,
> **I want to** fetch repository metadata from a connected GitHub account,
> **So that** I can support project publishing (for owners) and skill profiling (for contributors).

**Acceptance Criteria:**

- The ingestion service can fetch: repositories list, README content, language data, contribution activity, commit signals, repository descriptions, and statistics.
- Outputs are normalized into a common format consumable by both the project publishing flow and the AI skill profiling flow.
- Rate limiting and error handling are in place for GitHub API calls.
- The service is reusable across both owner and contributor workflows.

**Priority:** High
**Related Tasks:** TASK-1-05
**PRD References:** FR-028, FR-035

### User Journey 1.6 — GitHub Ingestion (System-Level)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Trigger                                                                  │
│    └─> Contributor connects GitHub → background ingestion job starts        │
│    └─> Owner submits repo URL → targeted ingestion for that repo           │
│                                                                             │
│ 2. GitHub API Calls                                                         │
│    └─> GET /user/repos → list of repositories                              │
│    └─> GET /repos/{owner}/{repo}/readme → README content                   │
│    └─> GET /repos/{owner}/{repo}/languages → language breakdown            │
│    └─> GET /repos/{owner}/{repo}/stats/contributors → contribution stats   │
│    └─> GET /repos/{owner}/{repo}/commits → commit messages/signals         │
│    └─> GET /repos/{owner}/{repo} → description, stars, forks              │
│                                                                             │
│ 3. Data Normalization                                                       │
│    └─> Raw API responses are transformed into structured records           │
│    └─> Records are stored and made available for downstream consumers      │
│                                                                             │
│ 4. Error Handling                                                           │
│    └─> Rate limit hit → retry with backoff                                 │
│    └─> Repository not found → skip, log warning                            │
│    └─> Timeout → retry up to 3 times, then mark as failed                  │
│                                                                             │
│ 5. Downstream Consumers                                                     │
│    └─> AI Skill Profiling Agent (Sprint 3)                                 │
│    └─> Project Metadata Fetch (Sprint 2)                                   │
│    └─> RAG Indexing (Sprint 2)                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 5: AI, RAG, and Pinecone Contracts Definition

### User Story 1.7 — Define AI Agent Contracts

> **As a** development team,
> **We want to** define clear input/output contracts for all AI agents, RAG pipelines, and Pinecone integration,
> **So that** the backend and AI service can integrate reliably in subsequent sprints.

**Acceptance Criteria:**

- LLM, embedding model, and LangChain/LangGraph approach are selected and documented.
- Pinecone index configuration is defined (namespace strategy, metadata fields, embedding dimensions).
- Input contracts are defined for each AI agent: Skill Profiling, Skill Validation, Skill Gap Guidance, and Contributor Matching.
- Output contracts include: structured schema, source attribution fields, confidence scoring, and failure handling paths.
- Contracts are stored as versioned documentation accessible to all team members.

**Priority:** High
**Related Tasks:** TASK-1-06
**PRD References:** FR-083–FR-094

### User Journey 1.7 — AI Contract Definition (Team-Level)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. AI Engineer (M2) reviews PRD requirements for AI Trinity                │
│    └─> Identifies 4 agents: Profiling, Validation, Guidance, Matching      │
│                                                                             │
│ 2. Technology Selection                                                     │
│    └─> LLM: Select model (e.g., GPT-4o, Claude, etc.)                     │
│    └─> Embeddings: Select embedding model for Pinecone                     │
│    └─> Framework: LangChain/LangGraph for agent orchestration              │
│    └─> Vector DB: Pinecone namespace and index configuration               │
│                                                                             │
│ 3. Contract Definition for Each Agent                                       │
│    ├─> Skill Profiling Agent                                               │
│    │   └─> Input: GitHub repos, languages, commits, README content         │
│    │   └─> Output: {skill_name, proficiency, confidence, evidence_source}  │
│    ├─> Skill Validation Agent                                              │
│    │   └─> Input: task requirements, approved contributor skills            │
│    │   └─> Output: {eligible: bool, confidence, justification, sources}    │
│    ├─> Skill Gap Guidance Agent                                            │
│    │   └─> Input: contributor skills, failed task requirements              │
│    │   └─> Output: {missing_skills, resources, practice_projects, path}    │
│    └─> Contributor Matching Agent                                          │
│        └─> Input: task requirements, candidate pool with skills/reputation │
│        └─> Output: {ranked_matches: [{contributor, score, justification}]} │
│                                                                             │
│ 4. Failure Handling                                                         │
│    └─> Low confidence → flag for manual review                             │
│    └─> Timeout → retry with backoff, then graceful degradation             │
│    └─> Unsupported input → return structured error                         │
│                                                                             │
│ 5. Documentation                                                            │
│    └─> Contracts stored in shared documentation                            │
│    └─> Backend team (M4/M5) uses these to build ports/adapters             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 6: Database Schema Foundation

### User Story 1.8 — Create Core Database Schema

> **As a** backend developer,
> **I want to** define the core database schema with all entity tables and relationships,
> **So that** all feature work in subsequent sprints has a solid data foundation.

**Acceptance Criteria:**

- Prisma schema defines tables for: users, roles, github_accounts, projects, contribution_requests, applications, skill_profiles, subscriptions, delivery_reviews, reports, reputation_records, auth_sessions, github_oauth_states.
- All foreign key relationships are properly defined.
- Migrations run successfully and preserve all relationships.
- pgvector extension is enabled for future semantic search needs.

**Priority:** High
**Related Tasks:** TASK-1-03
**PRD References:** All entity-related FRs

---

## Feature 7: Local Development Environment

### User Story 1.9 — Docker-Based Local Development

> **As a** team member,
> **I want to** have a documented Docker Compose setup for local development,
> **So that** I can run the full stack locally without manual dependency management.

**Acceptance Criteria:**

- `docker-compose.yml` includes: API service, PostgreSQL database, Redis (for BullMQ).
- A `.env.example` file documents all required environment variables.
- A README or setup guide explains the startup path (`docker compose up`).
- The setup is usable by all team members across different machines.

**Priority:** Medium
**Related Tasks:** TASK-1-07
**PRD References:** —

### User Journey 1.9 — Developer Local Setup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Developer clones the repo                                               │
│    └─> git clone https://github.com/ITI-Sharek/Backend.git                 │
│                                                                             │
│ 2. Environment Setup                                                        │
│    └─> cp .env.example .env                                                │
│    └─> Fill in required values (DB credentials, GitHub OAuth secrets, etc.) │
│                                                                             │
│ 3. Start Services                                                           │
│    └─> docker compose up -d                                                │
│    └─> PostgreSQL starts on port 5432                                      │
│    └─> Redis starts on port 6379                                           │
│    └─> API service starts on port 3000                                     │
│                                                                             │
│ 4. Run Migrations                                                           │
│    └─> npx prisma migrate dev                                              │
│    └─> Database schema is created                                          │
│                                                                             │
│ 5. Verify                                                                   │
│    └─> API health endpoint responds with 200                               │
│    └─> Database connections are working                                    │
│    └─> Developer is ready to work                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Sprint 1 Summary Table

| Story ID | User Story | Actor | Priority | Tasks |
|----------|-----------|-------|----------|-------|
| US-1.1 | Register as Project Owner | Project Owner | High | TASK-1-03, TASK-1-04 |
| US-1.2 | Register as Contributor | Contributor | High | TASK-1-03, TASK-1-04 |
| US-1.3 | Connect GitHub (Owner) | Project Owner | High | TASK-1-04 |
| US-1.4 | Connect GitHub (Contributor) | Contributor | High | TASK-1-04, TASK-1-05 |
| US-1.5 | Login to Share-k | All Users | High | TASK-1-04 |
| US-1.6 | Fetch GitHub Repository Data | System | High | TASK-1-05 |
| US-1.7 | Define AI Agent Contracts | Dev Team | High | TASK-1-06 |
| US-1.8 | Create Core Database Schema | Backend Dev | High | TASK-1-03 |
| US-1.9 | Docker Local Development | Dev Team | Medium | TASK-1-07 |
