# Sprint 8 — AWS Deployment and Demo Readiness

**Sprint Goal:** Deploy Share-k to AWS, complete final verification, and prepare a stable capstone demo of the MVP.
**Duration:** Week 8

---

## Feature 1: Demo UX Finalization

### User Story 8.1 — Polish Demo UX and Prepare Scenario Script

> **As the** team,
> **We want** a polished demo experience with a scripted walkthrough,
> **So that** the capstone presentation showcases the full MVP capabilities convincingly.

**Acceptance Criteria:**

- All demo-critical screens are visually polished and free of placeholder content.
- A written scenario script is produced that walks through:
  1. **Owner flow**: register → connect GitHub → publish project → create contribution request → view AI-matched contributors → review applications → approve delivery → rate contributor.
  2. **Contributor flow**: register → connect GitHub → onboarding status → view skill profile → discover projects → browse task feed → apply → get accepted → submit PR → receive approval and rating → view reputation.
  3. **Admin flow**: review pending skill profiles → approve/reject skills → handle disputes → manage reports.
- The script includes timing estimates, speaker notes, and fallback plans for each step.
- Demo data is seeded to ensure each step has realistic content to show.

**Priority:** High
**Related Tasks:** TASK-8-01
**PRD References:** All user-facing FRs

### User Journey 8.1 — Demo Script Walkthrough

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ DEMO SCRIPT: SHARE-K CAPSTONE PRESENTATION                                 │
│ Estimated Duration: 15–20 minutes                                          │
│                                                                             │
│ ═══════════════════════════════════════════════════════════════════════════  │
│ ACT 1: PROJECT OWNER JOURNEY (~6 minutes)                                  │
│ ═══════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│ SCENE 1: Registration & GitHub Connection (1 min)                          │
│ ├─> Show registration form → select "Project Owner"                        │
│ ├─> Skip to pre-verified account (demo shortcut)                           │
│ ├─> Show GitHub OAuth flow → connected account                            │
│ └─> Speaker note: "Share-k connects to GitHub to auto-populate projects." │
│                                                                             │
│ SCENE 2: Project Publishing (2 min)                                        │
│ ├─> Paste GitHub repo URL → system fetches metadata                        │
│ ├─> Show auto-populated form: title, description, languages, tech tags    │
│ ├─> Edit a field → show owner control over AI-fetched data                │
│ ├─> Click "Publish" → project appears in discovery feed                   │
│ └─> Speaker note: "One URL and the project is live with rich metadata."   │
│                                                                             │
│ SCENE 3: Creating Contribution Request (1.5 min)                           │
│ ├─> Create task: "Add JWT Authentication" with requirements               │
│ ├─> Show AI matching results → top 5 matched contributors (Silver)        │
│ ├─> Invite a matched contributor                                           │
│ └─> Speaker note: "AI proactively finds the best contributors."           │
│                                                                             │
│ SCENE 4: Reviewing Applications (1.5 min)                                  │
│ ├─> Show 2 eligible applications (pre-seeded)                              │
│ ├─> Highlight AI eligibility justification on each                         │
│ ├─> Accept one, reject another                                             │
│ ├─> Show delivery review → approve PR → rate contributor                  │
│ └─> Speaker note: "Owners only see pre-qualified applicants."             │
│                                                                             │
│ ═══════════════════════════════════════════════════════════════════════════  │
│ ACT 2: CONTRIBUTOR JOURNEY (~6 minutes)                                    │
│ ═══════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│ SCENE 5: Registration & Skill Profile (2 min)                              │
│ ├─> Show contributor registration → GitHub connection                      │
│ ├─> Show onboarding status: "Analyzing GitHub activity…"                  │
│ ├─> Show generated skill profile with evidence attribution                │
│ ├─> Show pending state → admin approves → account active                  │
│ └─> Speaker note: "AI objectively assesses skills from real evidence."    │
│                                                                             │
│ SCENE 6: Discovery & Application (2 min)                                   │
│ ├─> Browse project discovery feed → apply filters                         │
│ ├─> Use semantic search: "real-time messaging"                             │
│ ├─> Browse task feed → find "Add JWT Authentication"                       │
│ ├─> Apply → AI validates → eligible!                                       │
│ └─> Speaker note: "AI ensures only qualified devs reach the owner."       │
│                                                                             │
│ SCENE 7: Delivery & Reputation (2 min)                                     │
│ ├─> Show contributor accepted → submits PR link                            │
│ ├─> Owner approves → rates ⭐⭐⭐⭐⭐                                    │
│ ├─> Show updated reputation profile                                       │
│ ├─> Show rejection scenario → Gold-tier skill-gap guidance                │
│ └─> Speaker note: "Reputation is earned, not declared."                   │
│                                                                             │
│ ═══════════════════════════════════════════════════════════════════════════  │
│ ACT 3: ADMIN & PREMIUM (~4 minutes)                                       │
│ ═══════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│ SCENE 8: Admin Trust Review (2 min)                                        │
│ ├─> Admin dashboard → pending skill reviews                               │
│ ├─> Review skills with evidence → approve some, reject low-confidence     │
│ ├─> Show dispute handling                                                  │
│ └─> Speaker note: "Humans stay in the loop for trust decisions."          │
│                                                                             │
│ SCENE 9: Premium Tiers (2 min)                                             │
│ ├─> Show plan status display for owner and contributor                     │
│ ├─> Demonstrate order limit → upgrade prompt                              │
│ ├─> Show Gold contributor's AI-recommended tasks                          │
│ └─> Speaker note: "Premium tiers unlock AI-powered growth tools."         │
│                                                                             │
│ ═══════════════════════════════════════════════════════════════════════════  │
│ CLOSING: Architecture Overview (~2 minutes)                                │
│ ├─> Brief tech stack slide: NestJS, FastAPI, Pinecone, LangChain, AWS     │
│ ├─> AI Trinity diagram: LLM + RAG + Agents                                │
│ └─> Q&A                                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 2: Final Regression and Acceptance Testing

### User Story 8.2 — Run Final Regression Test Suite

> **As the** team,
> **We want** to run a comprehensive regression test suite against the release candidate,
> **So that** we confirm all critical workflows pass before the live demo.

**Acceptance Criteria:**

- All unit, integration, and E2E tests are run against the release candidate build.
- Critical workflows verified:
  - Registration → onboarding → activation
  - Project publishing → discovery
  - Task creation → AI-gated application → delivery → reputation
  - Premium limit enforcement
  - Admin review flows
- Test results are documented with pass/fail status.
- Any remaining defects are documented with: severity, description, and demo impact assessment.
- Go/no-go decision is made based on test results.

**Priority:** High
**Related Tasks:** TASK-8-02
**PRD References:** All critical FRs

### User Journey 8.2 — Regression Testing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Release candidate build is frozen                                       │
│                                                                             │
│ 2. Test Execution                                                           │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ REGRESSION TEST RESULTS — Release Candidate v1.0.0-rc1               │ │
│    │                                                                      │ │
│    │ Unit Tests:        ✅ 247/247 passed                                 │ │
│    │ Integration Tests: ✅ 82/82 passed                                   │ │
│    │ E2E Tests:         ✅ 18/18 passed                                   │ │
│    │                                                                      │ │
│    │ CRITICAL PATHS:                                                      │ │
│    │ ✅ Owner registration + GitHub                                       │ │
│    │ ✅ Contributor onboarding + skill profile                            │ │
│    │ ✅ Admin skill review                                                │ │
│    │ ✅ Project publishing                                                │ │
│    │ ✅ Discovery + filtering + semantic search                           │ │
│    │ ✅ Contribution request creation                                     │ │
│    │ ✅ AI-gated application (eligible + ineligible + low-confidence)      │ │
│    │ ✅ Delivery review + rating                                          │ │
│    │ ✅ Reputation update                                                 │ │
│    │ ✅ Premium limits (owner + contributor)                               │ │
│    │ ✅ AI matching (Silver/Gold)                                         │ │
│    │ ✅ Skill-gap guidance (Gold)                                         │ │
│    │                                                                      │ │
│    │ KNOWN ISSUES:                                                        │ │
│    │ ⚠️ Minor: Arabic RTL alignment off on discovery filters (cosmetic)   │ │
│    │ ⚠️ Minor: Slow load on first semantic search (~4s) — acceptable     │ │
│    │                                                                      │ │
│    │ DECISION: ✅ GO — Ready for deployment                               │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 3: AI Quality Validation and Demo Data

### User Story 8.3 — Validate AI Outputs for Demo Reliability

> **As the** AI engineer,
> **I want to** validate that all AI agents produce reliable, explainable outputs for the demo scenarios,
> **So that** the capstone demo showcases trustworthy AI behavior.

**Acceptance Criteria:**

- Demo data includes seeded GitHub profiles, projects, and contribution requests with known expected outcomes.
- AI outputs are validated for:
  - Skill Profiling: skills match the seeded GitHub data, evidence is cited.
  - Skill Validation: eligibility decisions match expected outcomes for test scenarios.
  - Contributor Matching: top matches are reasonable given seeded skills/reputation.
  - Skill-Gap Guidance: guidance is relevant and includes real learning resources.
- Confidence scores are present and reasonable on all outputs.
- Justification text is coherent and references specific evidence.
- Source attribution is present where applicable.

**Priority:** High
**Related Tasks:** TASK-8-03
**PRD References:** FR-083–FR-094, NFR-006, NFR-007

### User Journey 8.3 — AI Demo Data Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Seeded Demo Data                                                         │
│    ├─> 3 project owners with published projects                            │
│    ├─> 5 contributors with diverse GitHub profiles                         │
│    ├─> 4 contribution requests with varied requirements                    │
│    └─> Pre-generated skill profiles with expected outcomes                 │
│                                                                             │
│ 2. Validation Checks                                                        │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ AI VALIDATION REPORT — Demo Data                                     │ │
│    │                                                                      │ │
│    │ SKILL PROFILING:                                                     │ │
│    │ ✅ Contributor A: Python (Adv.), React (Int.) — matches GitHub data  │ │
│    │ ✅ Contributor B: Java (Int.), Spring Boot (Int.) — evidence cited   │ │
│    │ ✅ Contributor C: TypeScript (Adv.) — high confidence, sources valid │ │
│    │                                                                      │ │
│    │ SKILL VALIDATION:                                                    │ │
│    │ ✅ A applies to Python task → eligible (expected: eligible)          │ │
│    │ ✅ B applies to React task → ineligible (expected: ineligible)       │ │
│    │ ✅ C applies to TypeScript task → eligible (expected: eligible)      │ │
│    │                                                                      │ │
│    │ CONTRIBUTOR MATCHING:                                                 │ │
│    │ ✅ Top match for Python task = Contributor A (highest Python skill)   │ │
│    │ ✅ Rankings follow expected skill + reputation ordering               │ │
│    │                                                                      │ │
│    │ SKILL-GAP GUIDANCE:                                                  │ │
│    │ ✅ Gold contributor rejected → guidance identifies missing skills    │ │
│    │ ✅ Learning resources are real and relevant                          │ │
│    │ ✅ Practice projects are constructive                                 │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 4: Production Data and Admin Readiness

### User Story 8.4 — Prepare Production Seed Data and Admin Review Readiness

> **As the** team,
> **We want** deployment-safe seed data and verified admin workflows,
> **So that** the demo has realistic content and trust gates are working correctly.

**Acceptance Criteria:**

- Seed data is deployment-safe (no real user data, no hardcoded secrets).
- Seeded scenarios include:
  - Users in various states (active, pending, suspended).
  - Projects in various states (draft, published).
  - Skills in various states (pending, approved, rejected, disputed).
  - Applications in various lifecycle stages.
  - Reputation records with realistic metrics.
- Admin can access and manage all trust-related entities: pending skills, reports, disputes.
- Fraud prevention actions work: admin can suspend accounts, reject disputed claims.
- Required trust gates are not bypassed in the seeded data.

**Priority:** High
**Related Tasks:** TASK-8-04
**PRD References:** FR-023–FR-026, NFR-001, NFR-002

---

## Feature 5: AWS Deployment

### User Story 8.5 — Deploy the MVP to AWS

> **As the** team,
> **We want** the Share-k MVP deployed to AWS and accessible via a public URL,
> **So that** we can demonstrate it live during the capstone presentation.

**Acceptance Criteria:**

- Application services are deployed and running on AWS (EC2/ECS/Fargate, TBD).
- Database (PostgreSQL with pgvector) is provisioned and connected.
- Environment settings (secrets, API keys, database URLs) are configured securely.
- The CI/CD release workflow deploys the latest release candidate.
- The deployed environment supports all core MVP workflows.
- A public demo URL is accessible and usable.
- SSL/TLS is configured for the public URL.

**Priority:** High
**Related Tasks:** TASK-8-05
**PRD References:** —

### User Journey 8.5 — AWS Deployment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Pre-Deployment                                                           │
│    ├─> Release candidate tagged: v1.0.0-rc1                                │
│    ├─> All regression tests passed ✅                                      │
│    ├─> Seed data script prepared                                           │
│    └─> Environment variables configured in AWS Secrets Manager             │
│                                                                             │
│ 2. CI/CD Deployment Pipeline                                                │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ 🚀 DEPLOYMENT PIPELINE — v1.0.0-rc1                                  │ │
│    │                                                                      │ │
│    │ ✅ Build Docker images ··············· 45s                            │ │
│    │ ✅ Push to container registry ········ 20s                            │ │
│    │ ✅ Run database migrations ··········· 12s                            │ │
│    │ ✅ Seed demo data ···················· 8s                             │ │
│    │ ✅ Deploy API service ················ 1m 30s                         │ │
│    │ ✅ Deploy frontend ··················· 45s                            │ │
│    │ ✅ Health check passed ··············· 5s                             │ │
│    │                                                                      │ │
│    │ ✅ Deployment successful!                                            │ │
│    │ 🌐 URL: https://sharek.example.com                                   │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 3. Post-Deployment Verification                                             │
│    ├─> API health endpoint responds: 200 OK ✅                             │
│    ├─> Database connected and migrations applied ✅                        │
│    ├─> Demo data seeded correctly ✅                                       │
│    ├─> GitHub OAuth callback configured for production URL ✅              │
│    ├─> AI service (FastAPI) connected and responding ✅                    │
│    └─> Pinecone index accessible with seeded data ✅                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 6: Monitoring and Observability (Production)

### User Story 8.6 — Monitor Production Health and AI Behavior

> **As the** team,
> **We want** CloudWatch, Langfuse, and Sentry monitoring active on the deployed MVP,
> **So that** we can detect and diagnose issues during the demo.

**Acceptance Criteria:**

- **CloudWatch**: API health metrics, error rates, latency dashboards are configured.
- **Langfuse**: AI agent traces are flowing from the production deployment.
- **Sentry**: Runtime errors are being captured with proper tagging.
- Alert thresholds are set for critical metrics (5xx errors, high latency, AI agent failures).
- A monitoring dashboard is accessible for the team during the demo.

**Priority:** High
**Related Tasks:** TASK-8-06
**PRD References:** —

---

## Feature 7: Production Smoke Test and Release Sign-Off

### User Story 8.7 — Production Smoke Test and Demo Sign-Off

> **As the** team,
> **We want** to run a production smoke test against the deployed AWS environment,
> **So that** we can confirm all critical paths work in the live system before the demo.

**Acceptance Criteria:**

- Smoke tests verify the following against the live deployment:
  - Registration and login work.
  - GitHub OAuth connection works.
  - Project discovery feed loads with seeded data.
  - A contribution request can be viewed.
  - AI validation responds correctly.
  - Admin dashboard is accessible.
- CI/CD pipeline health is confirmed.
- Monitoring and alerting are active.
- AI trace capture is working in Langfuse.
- Final sign-off: all team members confirm readiness.
- Fallback plan is documented for each demo step in case of failure.

**Priority:** High
**Related Tasks:** TASK-8-07
**PRD References:** —

### User Journey 8.7 — Production Smoke Test

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Smoke Test Execution Against https://sharek.example.com                 │
│                                                                             │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ PRODUCTION SMOKE TEST RESULTS                                        │ │
│    │                                                                      │ │
│    │ ✅ API Health: /api/health → 200 OK (120ms)                         │ │
│    │ ✅ Login: demo-owner@sharek.com → token returned                    │ │
│    │ ✅ Login: demo-contributor@sharek.com → token returned              │ │
│    │ ✅ GitHub OAuth: redirect URL configured correctly                   │ │
│    │ ✅ Discovery Feed: 5 seeded projects loaded (340ms)                 │ │
│    │ ✅ Task Feed: 8 seeded tasks loaded (280ms)                         │ │
│    │ ✅ AI Validation: test application → eligible (1.3s)                │ │
│    │ ✅ AI Matching: test query → 5 matches returned (2.1s)              │ │
│    │ ✅ Admin Dashboard: accessible with admin credentials                │ │
│    │ ✅ Langfuse: AI traces visible in dashboard                         │ │
│    │ ✅ CloudWatch: metrics flowing                                       │ │
│    │ ✅ Sentry: test error captured and visible                           │ │
│    │                                                                      │ │
│    │ RESULT: ALL 12 CHECKS PASSED ✅                                     │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 2. Team Sign-Off                                                            │
│    ├─> M1 (UI/UX): Demo UX is polished ✅                                 │
│    ├─> M2 (AI): AI agents producing correct outputs ✅                    │
│    ├─> M3 (Frontend): All UI flows working ✅                             │
│    ├─> M4 (Backend): APIs stable and performant ✅                        │
│    ├─> M5 (Backend/Cloud): AWS deployment healthy ✅                      │
│    └─> M6 (DevOps): Monitoring and CI/CD operational ✅                   │
│                                                                             │
│ 3. FINAL STATUS: 🎉 READY FOR DEMO                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Sprint 8 Summary Table

| Story ID | User Story | Actor | Priority | Tasks |
|----------|-----------|-------|----------|-------|
| US-8.1 | Demo UX Polish & Script | Team | High | TASK-8-01 |
| US-8.2 | Final Regression Testing | Team | High | TASK-8-02 |
| US-8.3 | AI Quality Validation | AI Engineer | High | TASK-8-03 |
| US-8.4 | Production Seed Data | Backend Team | High | TASK-8-04 |
| US-8.5 | Deploy MVP to AWS | Backend/DevOps | High | TASK-8-05 |
| US-8.6 | Production Monitoring | DevOps | High | TASK-8-06 |
| US-8.7 | Smoke Test & Sign-Off | Team | High | TASK-8-07 |
