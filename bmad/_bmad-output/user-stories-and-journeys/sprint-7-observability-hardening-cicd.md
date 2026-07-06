# Sprint 7 — Observability, Quality Hardening, and CI/CD

**Sprint Goal:** Harden the MVP with observability, automated quality gates, E2E coverage, and deployable CI/CD infrastructure.
**Duration:** Week 7

---

## Feature 1: UX Polish and Accessibility

### User Story 7.1 — Ensure Accessibility Compliance Across Core Screens

> **As a** user with accessibility needs,
> **I want** the platform to meet WCAG 2.1 Level AA standards,
> **So that** I can use Share-k effectively regardless of my abilities.

**Acceptance Criteria:**

- All core screens are audited for WCAG 2.1 AA compliance:
  - Proper heading hierarchy (single `<h1>` per page)
  - Sufficient color contrast ratios (4.5:1 for text, 3:1 for large text)
  - All interactive elements are keyboard-accessible
  - ARIA labels on non-text content (icons, buttons, status indicators)
  - Focus indicators visible on all interactive elements
- Arabic/English layout readiness is verified:
  - RTL layout works correctly for Arabic
  - LTR layout works correctly for English
  - Text alignment, icon placement, and navigation adapt to language direction
- Responsive behavior verified across desktop, tablet, and mobile breakpoints.
- Empty states, loading states, and error messages are clear and consistent.

**Priority:** High
**Related Tasks:** TASK-7-01
**PRD References:** NFR-004, NFR-005

### User Journey 7.1 — Accessibility Audit Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. M1 (UI/UX & Testing) runs automated accessibility audit tools           │
│    └─> axe-core or similar on each core screen                             │
│    └─> Lighthouse accessibility score check                                │
│                                                                             │
│ 2. Screen-by-Screen Audit                                                   │
│    ├─> Registration / Login ── check form labels, error announcements      │
│    ├─> Dashboard (all roles) ── check heading hierarchy, nav, keyboard     │
│    ├─> Skill Profile ── check color contrast on skill badges               │
│    ├─> Project Discovery ── check filter controls, card interactions       │
│    ├─> Task Feed ── check card keyboard navigation                         │
│    ├─> Application Review (Owner) ── check action buttons, screen reader  │
│    ├─> Delivery Review ── check form accessibility                         │
│    └─> Reputation Profile ── check data visualization alternatives         │
│                                                                             │
│ 3. Bilingual Layout Verification                                            │
│    ├─> Switch to Arabic → verify RTL layout                                │
│    │   └─> Navigation moves to right side                                  │
│    │   └─> Text aligns right                                               │
│    │   └─> Icons and arrows flip appropriately                             │
│    └─> Switch to English → verify LTR layout                               │
│        └─> Standard left-to-right layout restored                          │
│                                                                             │
│ 4. Issues Documented                                                        │
│    └─> Each issue logged with: screen, severity, description, fix          │
│    └─> Critical issues fixed before demo                                   │
│    └─> Non-critical issues tracked for post-demo                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 2: End-to-End Test Suite

### User Story 7.2 — Run E2E Tests Covering All Critical Paths

> **As a** development team,
> **We want** a comprehensive E2E test suite covering all critical user paths,
> **So that** we have confidence the MVP works end to end before deployment.

**Acceptance Criteria:**

- E2E tests cover the following critical paths:
  1. **Registration** → email verification → GitHub connection
  2. **Contributor onboarding** → skill profile generation → admin approval → account activation
  3. **Project publishing** → repo URL → metadata review → publish
  4. **Project discovery** → filtering → semantic search
  5. **Contribution request** → create → publish → appears in task feed
  6. **AI-gated application** → apply → AI validates → eligible forwarded / ineligible blocked
  7. **Owner application review** → accept → assign → contributor begins work
  8. **Delivery submission** → PR link → owner review → approve/reject → rate
  9. **Reputation update** → metrics recalculated after approved delivery
  10. **Premium limits** → hit order/application limit → upgrade prompt shown
- Tests run reliably in CI without flakiness.
- Test results produce clear pass/fail reports.

**Priority:** High
**Related Tasks:** TASK-7-02
**PRD References:** All critical FRs

### User Journey 7.2 — E2E Test Execution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Developer runs: npm run test:e2e                                        │
│                                                                             │
│ 2. Test Suite Executes Critical Paths:                                      │
│                                                                             │
│    TEST 1: Full Owner Registration Flow                                     │
│    ├─> Register with email + "Project Owner" role                          │
│    ├─> Verify email                                                         │
│    ├─> Connect GitHub (mocked OAuth)                                       │
│    ├─> Assert: account status = active                                     │
│    └─> Result: ✅ PASS                                                     │
│                                                                             │
│    TEST 2: Full Contributor Activation Flow                                 │
│    ├─> Register as contributor → verify → connect GitHub                   │
│    ├─> Assert: ingestion triggered, skill profile generated (pending)      │
│    ├─> Admin approves skills                                               │
│    ├─> Assert: account status = active                                     │
│    └─> Result: ✅ PASS                                                     │
│                                                                             │
│    TEST 3: Project Publishing Flow                                          │
│    ├─> Owner submits GitHub repo URL                                       │
│    ├─> System fetches metadata (mocked GitHub API)                         │
│    ├─> Owner reviews and publishes                                         │
│    ├─> Assert: project visible in discovery feed                           │
│    └─> Result: ✅ PASS                                                     │
│                                                                             │
│    TEST 4: AI-Gated Application Flow                                       │
│    ├─> Owner creates contribution request                                  │
│    ├─> Eligible contributor applies                                        │
│    ├─> AI validates → eligible                                             │
│    ├─> Assert: application forwarded to owner                              │
│    ├─> Ineligible contributor applies                                      │
│    ├─> AI validates → ineligible                                           │
│    ├─> Assert: application blocked, not visible to owner                   │
│    └─> Result: ✅ PASS                                                     │
│                                                                             │
│    TEST 5: Full Contribution Lifecycle                                      │
│    ├─> Contributor accepted → submits PR → owner approves → rates          │
│    ├─> Assert: reputation updated, task completed                          │
│    └─> Result: ✅ PASS                                                     │
│                                                                             │
│    TEST 6: Premium Limit Enforcement                                        │
│    ├─> Bronze owner creates max orders → next one blocked                  │
│    ├─> Assert: limit message shown                                         │
│    └─> Result: ✅ PASS                                                     │
│                                                                             │
│ 3. Results Summary                                                          │
│    └─> 18/18 tests passed · 0 failed · Duration: 4m 32s                   │
│    └─> Coverage report generated                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 3: AI Observability and Quality Tracing

### User Story 7.3 — Observe and Trace AI Agent Behavior

> **As a** developer or AI engineer,
> **I want** AI agents to emit structured trace data for all decisions,
> **So that** I can evaluate accuracy, debug issues, and ensure AI behavior is trustworthy.

**Acceptance Criteria:**

- Each AI agent call (Skill Profiling, Validation, Matching, Guidance) emits traces containing:
  - Prompt sent to the LLM
  - Retrieved RAG sources used
  - Structured output returned
  - Confidence score
  - Low-confidence or failure outcomes
  - Latency and token usage
- Traces are viewable in Langfuse (or similar observability tool).
- Validation accuracy can be evaluated: compare AI decisions against ground-truth data.
- RAG faithfulness can be evaluated: check if outputs are grounded in retrieved evidence.
- No unsupported trust decisions are silently made — all are traceable.

**Priority:** High
**Related Tasks:** TASK-7-03
**PRD References:** FR-094, NFR-003, NFR-006, NFR-007

### User Journey 7.3 — AI Trace Investigation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. AI Engineer opens Langfuse dashboard                                    │
│                                                                             │
│ 2. Selects: Skill Validation Agent traces from the last 24 hours           │
│                                                                             │
│ 3. Trace Detail                                                            │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ TRACE ID: val-2026-07-05-1234                                        │ │
│    │                                                                      │ │
│    │ Agent: SkillValidationAgent                                          │ │
│    │ Trigger: Application by contributor_id=xyz to task_id=abc             │ │
│    │ Timestamp: 2026-07-05 14:23:15 UTC                                   │ │
│    │ Latency: 1.2s                                                        │ │
│    │ Tokens: 1,450 input / 320 output                                     │ │
│    │                                                                      │ │
│    │ PROMPT:                                                               │ │
│    │ "Compare the following contributor skills against the task            │ │
│    │  requirements and determine eligibility..."                          │ │
│    │                                                                      │ │
│    │ RAG SOURCES RETRIEVED:                                                │ │
│    │ 1. contributor-profile/xyz/readme-chunk-3 (score: 0.91)              │ │
│    │ 2. contributor-profile/xyz/repo-summary (score: 0.88)                │ │
│    │                                                                      │ │
│    │ OUTPUT:                                                               │ │
│    │ { eligible: true, confidence: 87, justification: "..." }             │ │
│    │                                                                      │ │
│    │ EVALUATION:                                                           │ │
│    │ Ground truth: eligible ✅ — AI decision matches                      │ │
│    │ Faithfulness: output references sources 1 and 2 ✅                   │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 4. Aggregate Metrics                                                        │
│    └─> Validation accuracy: 92% (target: >90%) ✅                         │
│    └─> RAG faithfulness: 94% (target: >90%) ✅                            │
│    └─> Average latency: 1.1s                                              │
│    └─> Low-confidence outcomes: 8% (all flagged for review) ✅            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 4: Backend Hardening

### User Story 7.4 — Harden API Reliability and Error Handling

> **As a** user,
> **I want** the platform to handle errors gracefully and respond quickly,
> **So that** I never encounter silent failures or confusing error states.

**Acceptance Criteria:**

- All API endpoints have proper validation error responses with clear messages.
- Authorization checks prevent unauthorized access to all protected resources.
- Retry logic is in place for transient failures (database timeouts, external API calls).
- P95 API response time is under 3 seconds for non-streaming core interactions.
- When AI or external dependencies fail, users see clear fallback messages rather than silent failures.
- No trust decisions are made silently when a dependency fails.

**Priority:** High
**Related Tasks:** TASK-7-04
**PRD References:** NFR-008

---

## Feature 5: CI/CD Pipeline

### User Story 7.5 — Automated Build, Test, and Deploy Pipeline

> **As a** development team,
> **We want** a GitHub Actions CI/CD pipeline that automatically runs linting, tests, and builds on every push,
> **So that** we catch regressions early and can deploy reliably to AWS.

**Acceptance Criteria:**

- GitHub Actions workflow triggers on push and pull request to main.
- Pipeline stages:
  1. **Lint** — ESLint runs, fails on errors.
  2. **Test** — unit + integration tests run, fails on any failure.
  3. **Build** — production build completes successfully.
  4. **Environment validation** — required env vars are checked.
  5. **Deploy prep** — deployable artifacts are produced targeting AWS.
- Pipeline produces clear pass/fail results and failure details.

**Priority:** High
**Related Tasks:** TASK-7-05
**PRD References:** —

### User Journey 7.5 — CI/CD Pipeline Execution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Developer pushes code to feature branch                                  │
│    └─> Opens PR to main                                                    │
│                                                                             │
│ 2. GitHub Actions Triggered                                                 │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ 🔄 CI/CD Pipeline — PR #45: "Add delivery review endpoint"           │ │
│    │                                                                      │ │
│    │ ✅ Lint (ESLint) ··················· 12s                              │ │
│    │ ✅ Unit Tests (Jest) ··············· 34s (152 passed)                 │ │
│    │ ✅ Integration Tests ··············· 1m 12s (48 passed)              │ │
│    │ ✅ Build (NestJS) ·················· 28s                              │ │
│    │ ✅ Environment Validation ·········· 3s                               │ │
│    │ ✅ Deploy Artifact Generated ······· 8s                               │ │
│    │                                                                      │ │
│    │ ✅ All checks passed                                                 │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 3. PR merged → main branch pipeline runs                                   │
│    └─> Same stages + deployment preparation                                │
│    └─> Artifact ready for AWS deployment (Sprint 8)                        │
│                                                                             │
│ 4. Failure Example                                                          │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ ❌ CI/CD Pipeline — PR #46: "Update skill validation logic"          │ │
│    │                                                                      │ │
│    │ ✅ Lint ···························· 12s                              │ │
│    │ ❌ Unit Tests ····················· 31s (1 failed)                    │ │
│    │    └─> FAIL: skill-validation.spec.ts                                │ │
│    │    └─> Expected: eligible, Received: ineligible                      │ │
│    │ ⏭️ Remaining stages skipped                                          │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│    └─> Developer fixes the test, pushes again                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 6: Monitoring and Error Tracking

### User Story 7.6 — Runtime Error Monitoring with Sentry

> **As a** developer,
> **I want** runtime errors in production to be captured and reported with context,
> **So that** I can quickly identify and fix issues affecting users.

**Acceptance Criteria:**

- Sentry is configured for both frontend and backend services.
- Errors are tagged with release version and environment (dev/staging/production).
- Core user flow errors are captured with enough diagnostic context (user role, action being performed, stack trace).
- Alert rules notify the team of new/recurring critical errors.

**Priority:** Medium
**Related Tasks:** TASK-7-07
**PRD References:** —

---

## Sprint 7 Summary Table

| Story ID | User Story | Actor | Priority | Tasks |
|----------|-----------|-------|----------|-------|
| US-7.1 | Accessibility Compliance | All Users | High | TASK-7-01 |
| US-7.2 | E2E Test Suite | Dev Team | High | TASK-7-02 |
| US-7.3 | AI Observability & Tracing | Dev Team / AI Engineer | High | TASK-7-03 |
| US-7.4 | API Hardening & Reliability | All Users | High | TASK-7-04 |
| US-7.5 | CI/CD Pipeline | Dev Team | High | TASK-7-05 |
| US-7.6 | Runtime Error Monitoring | Dev Team | Medium | TASK-7-07 |
