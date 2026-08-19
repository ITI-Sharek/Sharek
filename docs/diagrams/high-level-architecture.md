# High-Level Architecture

Share-k connects **project owners** who need work done on their GitHub
repositories with **contributors** whose skills are backed by evidence from
their own repositories. Everything an AI model produces is advisory: the NestJS
backend makes every final decision and owns every state write.

## 1. System Context

```mermaid
flowchart TB
  OWNER(["Project Owner<br/>publishes projects and work"])
  CONTRIB(["Contributor<br/>applies, delivers work"])
  ADMIN(["Admin<br/>reviews AI-generated skills"])

  SHAREK["<b>Share-k Platform</b><br/>Project and contribution marketplace<br/>with evidence-backed skill profiles"]

  GITHUB["GitHub<br/>OAuth, GitHub App,<br/>repository evidence, webhooks"]
  PAYMOB["Paymob<br/>subscription checkout<br/>and HMAC callbacks"]
  LLM["LLM Provider (Groq)<br/>reached only through<br/>the Share-k AI service"]
  SMTP["SMTP Provider<br/>OTP and account email"]

  OWNER --> SHAREK
  CONTRIB --> SHAREK
  ADMIN --> SHAREK

  SHAREK <--> GITHUB
  SHAREK <--> PAYMOB
  SHAREK --> LLM
  SHAREK --> SMTP
```

**Trust boundary:** the browser never talks to the AI service, the LLM provider,
or Paymob's server API directly. Every external call is made server-side by the
NestJS backend with server-held secrets.

## 2. Container Diagram

```mermaid
flowchart TB
  subgraph BROWSER["Client tier"]
    WEB["<b>Web Client</b><br/>React + TanStack Router + Vite<br/>bilingual ar/en"]
  end

  subgraph BACKEND["Application tier"]
    API["<b>NestJS Backend</b> (port 4000)<br/>feature-first modular monolith<br/>HTTP REST + Socket.IO<br/><i>owns all state and all decisions</i>"]
    WORKERS["<b>BullMQ Workers</b><br/>in-process, feature-flagged<br/>skill profiling, advisory fit,<br/>material scan and analysis,<br/>review window, notification recovery"]
  end

  subgraph AI["AI tier"]
    FASTAPI["<b>Share-k AI Service</b> (port 8010)<br/>FastAPI, internal bearer token<br/>8 agents, structured output only<br/><i>no database access</i>"]
  end

  subgraph DATA["Data tier"]
    PG[("<b>PostgreSQL 16 + pgvector</b><br/>87 tables, Prisma-owned schema<br/>embeddings for material chunks")]
    REDIS[("<b>Redis 7</b><br/>BullMQ queues +<br/>Socket.IO adapter fan-out")]
    FS[("<b>Material Storage</b><br/>content-addressed files<br/>MATERIAL_STORAGE_ROOT")]
  end

  subgraph EXT["External"]
    GH["GitHub API<br/>+ App webhooks"]
    PM["Paymob API<br/>+ HMAC webhook"]
    GROQ["Groq / LLM provider"]
    MAIL["SMTP"]
  end

  WEB -->|"HTTPS REST<br/>Bearer access token"| API
  WEB -->|"WebSocket /realtime<br/>same access token"| API

  API --> WORKERS
  API -->|Prisma| PG
  WORKERS -->|Prisma| PG
  API -->|"pub/sub + queues"| REDIS
  WORKERS --> REDIS
  API --> FS
  WORKERS --> FS

  API -->|"HTTP + internal bearer<br/>AI_SERVICE_AUTH_TOKEN"| FASTAPI
  WORKERS -->|"HTTP + internal bearer"| FASTAPI
  FASTAPI --> GROQ

  API <--> GH
  GH -->|"webhook POST /webhooks/github/app"| API
  API --> PM
  PM -->|"webhook POST /payments/paymob/webhook"| API
  API --> MAIL
```

### Container responsibilities

| Container | Owns | Never does |
| --- | --- | --- |
| Web Client | Presentation, routing, localized copy | Call the AI service, LLM providers, or Paymob's server API |
| NestJS Backend | AuthN/AuthZ, business state, all database writes, audit snapshots, final decisions | Run prompts or call model providers itself |
| BullMQ Workers | Long-running and retriable work, reaping stale runs | Bypass the owning module's service to write tables |
| AI Service (FastAPI) | Prompts, provider calls, structured recommendation output | Touch the database, decide anything, hold user sessions |
| PostgreSQL | Single source of truth, pgvector similarity | — |
| Redis | Queue transport and cross-instance socket fan-out | Hold anything authoritative (ADR 0013) |

## 3. Backend Module Landscape

The backend is a **feature-first modular monolith** — not layered Clean
Architecture. One business capability, one module, one owner of its tables.
Cross-module access always goes through a service exported by the owning
module's `@Module`.

```mermaid
flowchart TB
  subgraph SHARED["shared/ — technical cross-cutting only"]
    direction LR
    S1["auth<br/>AccessTokenGuard, RolesGuard"]
    S2["database<br/>DatabaseService (Prisma)"]
    S3["realtime<br/>RealtimeGateway, Publisher, RedisIoAdapter"]
    S4["queue<br/>Redis connection"]
    S5["errors<br/>ApplicationError, HttpExceptionFilter"]
    S6["config / validation / observability / skills"]
  end

  subgraph EDGE["Identity & access"]
    IDENTITY["identity"]
    GITHUBM["github"]
    CONTRIBP["contributor-profiles"]
  end

  subgraph COMMERCE["Commerce"]
    SUBS["subscriptions<br/>EntitlementsService"]
    PAY["payments"]
  end

  subgraph CATALOG["Work definition"]
    PROJ["projects"]
    TASKS["contribution-tasks"]
    PROPS["contribution-proposals"]
    MATS["materials"]
  end

  subgraph FLOW["Selection & execution"]
    ELIG["eligibility"]
    APPS["applications"]
    DELIV["delivery-reviews"]
    CONVS["assignment-conversations"]
  end

  subgraph INTEL["Skills & AI"]
    SKP["skill-profiles"]
    SKG["skill-guidance"]
    MATCH["matching"]
    AIM["ai<br/>7 typed FastAPI clients"]
  end

  subgraph SUPPORT["Support"]
    NOTIF["notifications"]
    REP["reputation"]
    BADGES["badges"]
    DASH["dashboard"]
    ADMIN["admin"]
    HEALTH["health"]
  end

  IDENTITY --> NOTIF
  GITHUBM --> IDENTITY
  SKP --> GITHUBM
  SKP --> AIM
  SKP --> NOTIF
  ADMIN --> SKP
  ADMIN --> IDENTITY

  PROJ --> GITHUBM
  TASKS --> PROJ
  TASKS --> AIM
  PROPS --> PROJ
  PROPS --> TASKS
  PROPS --> ELIG
  MATS --> PROJ
  MATS --> AIM
  MATS --> SUBS

  ELIG --> SKP
  ELIG --> TASKS
  APPS --> ELIG
  APPS --> TASKS
  APPS --> AIM
  APPS --> SUBS
  APPS --> NOTIF
  APPS --> CONVS
  SKG --> ELIG
  SKG --> AIM
  MATCH --> SKP
  MATCH --> TASKS
  MATCH --> AIM
  DELIV --> APPS
  DELIV --> REP
  DELIV --> BADGES
  DELIV --> NOTIF
  CONVS --> NOTIF
  DASH --> APPS
  DASH --> DELIV

  NOTIF --> S3
  CONVS --> S3
```

### Module boundary rules

1. Each business capability has exactly one owning module.
2. A module writes only its own tables.
3. Cross-module calls use services exported from the provider's `@Module`.
4. Never import another module's repository, client, security implementation,
   job, controller, mapper, validator, or utility.
5. `shared/` holds technical code only — no business policy.
6. Events describe completed facts; each listener updates its own state.

## 4. Request and Delivery Paths

```mermaid
flowchart LR
  REQ["HTTP request"] --> CORS["CORS + rawBody"]
  CORS --> PIPE["Global ValidationPipe<br/>whitelist + transform"]
  PIPE --> GUARD1["AccessTokenGuard<br/>hashed opaque token → AuthSession"]
  GUARD1 --> GUARD2["RolesGuard<br/>@Roles metadata"]
  GUARD2 --> CTRL["Controller<br/>DTO in / DTO out"]
  CTRL --> SVC["Service<br/>authorization, workflow,<br/>final decision"]
  SVC --> DB[("Prisma transaction")]
  SVC -.->|"strictly after commit"| Q["BullMQ enqueue"]
  SVC -.->|"exported service"| OTHER["Other module service"]
  SVC -.->|"typed client"| AICL["AI client → FastAPI"]
  SVC --> FILTER["HttpExceptionFilter<br/>stable error codes"]
  FILTER --> RES["Domain-safe DTO"]

  Q --> W["Worker"]
  W --> DB
  W --> OUTBOX["Outbox row committed"]
  OUTBOX --> PUB["RealtimePublisherService"]
  PUB --> REDISADP["Socket.IO Redis adapter"]
  REDISADP --> ROOM["room user:&lt;id&gt;"]
  ROOM --> CLIENT["Web client"]
```

Two rules make this shape safe:

- **Enqueue after commit.** Jobs are dispatched strictly after the database
  transaction commits, so a worker can never read a row that does not exist yet.
- **Durable before realtime.** A `Notification`, `MessageEvent`, or
  `DeliveryApprovedEvent` row is committed before any socket emit is attempted.
  A Redis outage degrades delivery latency, never correctness — the HTTP inbox
  and the recovery worker still converge (ADR 0007, ADR 0013).

## 5. AI Boundary

```mermaid
flowchart LR
  subgraph NEST["NestJS — decides"]
    CALLER["Owning module service"]
    AISVC["AiService"]
    C1["FastApiSkillProfileClient"]
    C2["AdvisoryFitClient"]
    C3["MaterialAnalysisClient"]
    C4["SkillGapGuidanceClient"]
    C5["RequirementInferenceClient"]
    C6["MatchingRankClient"]
    C7["ContributorMatchingClient"]
  end

  subgraph PY["FastAPI — recommends"]
    A1["/skill-profiles/generate"]
    A2["/advisory-fit/assess"]
    A3["/material-analysis/analyze"]
    A4["/skill-gap-guidance/generate"]
    A5["/requirements/infer"]
    A6["/matching/rank"]
    A7["/contributor-matching/generate"]
  end

  PROVIDER["LLM provider"]

  CALLER --> AISVC
  AISVC --> C1 --> A1
  AISVC --> C2 --> A2
  AISVC --> C3 --> A3
  AISVC --> C4 --> A4
  AISVC --> C5 --> A5
  AISVC --> C6 --> A6
  AISVC --> C7 --> A7
  A1 --> PROVIDER
  A2 --> PROVIDER
  A3 --> PROVIDER
  A4 --> PROVIDER
  A5 --> PROVIDER
  A6 --> PROVIDER
  A7 --> PROVIDER

  CALLER -->|"validates, decides, writes"| DB[("PostgreSQL")]
```

Invariants this boundary enforces:

| Invariant | Consequence |
| --- | --- |
| The AI service has no database credentials | It cannot change state even if compromised |
| Every client is timeout-bounded and typed | A provider hang cannot hold an HTTP request open |
| Clients revalidate every citation | Unmatched `evidenceId` values are discarded backend-side |
| A provider outage is a retriable error, never an outcome | No contributor is recorded as `blocked` because a model was down (ADR 0015) |
| AI output lands in its own tables | `AdvisoryFitAssessment`, `MaterialDraftSuggestion`, `AiMatchResult`, `SkillProfile(pending)` — never directly in `Application.status` or a published `Project` |
| Every run records `provider`/`model`/`prompt_version`/`schema_version` | Any output can be traced back to the exact configuration that produced it |

## 6. Deployment (local / Docker Compose)

```mermaid
flowchart TB
  subgraph NET["docker network: sha-rek-network"]
    API["sha-rek-api<br/>node:4000<br/>prisma migrate deploy → db seed → nest start"]
    PGC["sha-rek-postgres<br/>pgvector/pgvector:pg16"]
    RDC["sha-rek-redis<br/>redis:7-alpine"]
  end

  VOL1[("postgres_data")]
  VOL2[("material_storage")]
  AIEXT["AI service<br/>run separately on :8010"]
  DEV["Developer browser<br/>Vite dev server"]

  API --> PGC
  API --> RDC
  API --> VOL2
  PGC --> VOL1
  API -->|"AI_SERVICE_URL"| AIEXT
  DEV --> API

  API -.->|"healthcheck GET /health"| API
```

Startup order is enforced by `depends_on` with health conditions: Postgres must
report healthy before the API container runs migrations and seeds.

## 7. Configuration Surface

Environment variables are validated at boot by a Joi schema
(`shared/config/env.validation.ts`); the process refuses to start on an invalid
configuration.

| Group | Representative keys | Controls |
| --- | --- | --- |
| Core | `PORT`, `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGINS`, `FRONTEND_URL` | Runtime and connectivity |
| Sessions | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Token hashing for `AuthSession` |
| GitHub | `GITHUB_CLIENT_*`, `GITHUB_APP_*`, `GITHUB_TOKEN_ENCRYPTION_KEY` | Legacy OAuth and current GitHub App |
| Google | `GOOGLE_CLIENT_*`, `GOOGLE_OAUTH_CALLBACK_URL` | Social sign-in |
| AI | `AI_SERVICE_URL`, `AI_SERVICE_AUTH_TOKEN`, per-route `*_PATH` / `*_TIMEOUT_MS` | AI boundary and timeouts |
| Payments | `PAYMENTS_PAYMOB_ENABLED`, `PAYMOB_SECRET_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_IDS` | Checkout and callback verification |
| Materials | `MATERIAL_STORAGE_ROOT`, `MATERIAL_MAX_BYTES`, `MATERIAL_ALLOWED_MIME_TYPES`, `MATERIAL_DOWNLOAD_TOKEN_SECRET` | Upload, scan, and signed download |
| Realtime | `REALTIME_NOTIFICATIONS_ENABLED`, `NOTIFICATION_EVENT_*` | Socket transport and outbox recovery |
| Queues | `*_QUEUE_ENABLED`, `*_INTERVAL_MS`, `*_STALE_AFTER_MS` | Per-feature worker rollout and reaping |

Every worker is behind its own `*_QUEUE_ENABLED` flag, so asynchronous features
roll out — and roll back — independently of the HTTP surface.
