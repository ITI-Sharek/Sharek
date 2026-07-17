# ShareK — Backend Architecture

**Status:** APPROVED
**Date:** 2026-07-17
**Depends on:** `product-brief.md`, `prd.md`
**Supersedes:** this file's previous version, and `docs/archive/bmad-output/planning-artifacts/architecture/adr-001-backend-architecture.md`'s separate-FastAPI-service decision (see ADR-003, `docs/adr/` — pending, written after this document per the file plan). ADR-002 (`docs/archive/bmad-output/planning-artifacts/architecture/adr-002-standard-nestjs-module-architecture.md`) is **not** superseded — its module-shape/boundary decisions are ratified below unchanged.

This document describes documentation only — target state and the gap against the current codebase. No code or schema changes were made while writing it.

---

## 1. Ratified stack

| Layer | Choice | Status |
|---|---|---|
| Frontend | TanStack Start (React 19, Vite/Nitro SSR), `frontend/**` | `IN_DEVELOPMENT` — scaffold only |
| Backend | NestJS 11, modular monolith, `backend/**` | `IN_DEVELOPMENT` |
| Database | PostgreSQL via Prisma 6 | `IMPLEMENTED` — confirmed in `backend/package.json` (`@prisma/client ^6.1.0`) and `prisma/schema.prisma` |
| pgvector | Present but **dormant** — no semantic search in MVP, SQL filters only (FR-25) | `DEFERRED` — not yet in `schema.prisma` at all; "dormant" describes the MVP target, not current state |
| Async jobs | Redis + BullMQ | `IMPLEMENTED` — confirmed (`bullmq ^5.80.2`), used today by `skill-profiles` |
| AI integration | NestJS-only, behind an `AiPort` interface — **no separate Python/FastAPI service** unless a Python-only need is later proven | `PROPOSED` — see §3; **does not match current code**, which has a live `FastApiSkillProfileClient` (`src/modules/ai/integrations/fastapi-skill-profile.client.ts`) and no `AiPort`. This is the ADR-003 change. |
| Real-time | None — no WebSocket gateway anywhere | `APPROVED` (absence is the decision) |
| File storage | None — no S3/object storage, evidence and CV/work-samples are links (FR-31/32) | `APPROVED` (absence is the decision) |
| Local dev | Docker Compose | `IMPLEMENTED` |

## 2. Module map

Twelve modules exist in `backend/src/modules/` today. Mapped against the MVP module set implied by `prd.md`:

| Module | Covers (PRD FRs) | Status |
|---|---|---|
| `identity` | FR-01–08 (auth, capability-model roles, sessions, settings) | `IN_DEVELOPMENT` — real code exists; **`User.role`/`User.status` need rework, see §5** |
| `github` | FR-02, FR-36 (OAuth, on-demand PR validation) | `IN_DEVELOPMENT` |
| `contributor-profiles` + `skill-profiles` | FR-14–18 (public profile, skill evidence states) | `IN_DEVELOPMENT` — real code exists for generation; evidence-state ladder (FR-15) not yet reflected in schema |
| `projects` | FR-19–22 | `IN_DEVELOPMENT` |
| `contribution-tasks` | FR-23–24 (tasks, task comments) | `IN_DEVELOPMENT` — task comments (FR-24) not yet confirmed built |
| `applications` | FR-27–30 (apply, accept/reject, advisory AI fit) | `PROPOSED` — **module folder exists with no service/controller yet**, effectively unbuilt |
| `delivery-reviews` | FR-31–38 (evidence, PR states, owner review, owner-silence SLA) | `IN_DEVELOPMENT` |
| `reviews` | FR-39–40 (blind bilateral peer review) | `PROPOSED` — **does not exist**, net-new module |
| `reputation` | FR-41–42 | `IN_DEVELOPMENT` |
| `notifications` | FR-43 | `PROPOSED` — not seen as a distinct module in the current list; may live inside another module today |
| `admin` | FR-44–45 | `IN_DEVELOPMENT` |
| `ai` | FR-14, FR-29 (`AiPort` facade) | `IN_DEVELOPMENT` — real code exists, **currently the wrong shape**, see §3 |
| `health` | infra | `IMPLEMENTED` |

**Deliberately absent from this map** (Post-MVP or Rejected per `prd.md` §6): `chat`, `discussions` (beyond flat task comments), `learning`, `recommendations` as a standalone module, `disputes` as a rich module, `moderation` beyond what `admin` covers, `payments`, `ai-orchestration` as a separate concept from `ai`, `audit` as a standalone module (audit trail lives on the relevant entities instead).

## 3. `AiPort` design (target — not yet built)

**Interface**, owned by the `ai` module:

```ts
interface AiPort {
  generateSkillProfile(input: SkillProfileInput): Promise<SkillProfileResult>;
  generateApplicationFitAnalysis(input: FitAnalysisInput): Promise<FitAnalysisResult>;
}
```

One in-process NestJS implementation calls the model provider SDK directly — no HTTP hop to a separate service. This replaces `FastApiSkillProfileClient` (deleted as part of the ADR-003 change, not part of this documentation pass).

**BullMQ job flow** (applies to both skill-profile generation, which already exists in this shape, and application fit analysis, which is net-new):

```text
Trigger (GitHub connect / application submitted)
  -> enqueue job (skill-profile-generation | application-fit-analysis)
  -> AiPort call
  -> validate structured output (schema check, not trust check)
  -> persist AiOutput: result + confidence + evidence refs + prompt version + model version
  -> update the owning entity (SkillProfile | Application)
  -> AI outage or malformed output -> job fails -> owning entity proceeds without AI output, never blocks (advisory, ADR-014)
```

Every `AiOutput` record stores `promptVersion` and `modelVersion` (FR-14, FR-29 AC). The 30-case golden evaluation set that checks this port's output quality is specified in `test-strategy.md` (pending).

## 4. Domain events and queue jobs (MVP subset)

Domain events (in-process, not a message bus — NestJS event emitter is sufficient at this scale):

```text
UserGitHubConnected
SkillProfileGenerated
ApplicationSubmitted
ApplicationFitAnalysisCompleted
ApplicationAccepted
ApplicationRejected
ContributionEvidenceSubmitted
ContributionApproved       -> triggers: CONTRIBUTION_DEMONSTRATED skill upgrade (FR-15) + reputation event (FR-41)
ContributionRejected
DeliveryReviewExpired      -> owner-silence 14-day SLA (FR-38), no reputation event
ReviewWindowOpened
ReviewPublished            -> reputation event (FR-41)
```

Queue jobs:

- `skill-profile-generation` — exists today.
- `application-fit-analysis` — net-new, same shape as above.
- `pr-validation` — on-demand only, triggered by evidence submission or a manual re-check; **no webhook listener** (FR-36).
- `delivery-review-expiry` — scheduled, flips `submittedAt + 14d` unreviewed submissions to `UNREVIEWED` (FR-38).
- `notification-dispatch` — in-app only; notifications are polled by the client, not pushed (FR-43).

## 5. Capability model — target shape (FR-07)

`ADMIN` is the only account-level role. `OWNER` / `CONTRIBUTOR` / `APPLICANT` are derived per project, not stored as a fixed field on the user — the same person is `OWNER` on one project and `CONTRIBUTOR` on another, on one account.

**This does not match the current schema.** `prisma/schema.prisma`'s `User.role` is a required `UserRole` enum (`owner | contributor | admin`), set directly from the registration payload (`auth.service.ts`'s `createRegisteredUser`) — real, tested behavior (`auth.service.spec.ts`), not just a stale doc. Fixing this is real migration work — deliberately **out of scope for this documentation pass**; noted here so the gap isn't silently lost.

**Correction to an earlier read of this codebase (this session):** `User.status = 'pending'` was initially flagged here as the account-activation gate FR-16 rejects. Closer inspection shows that's wrong — `status: 'pending'` on registration is an **email-verification** gate, not an admin-approval gate: `session.service.ts:114` carves out contributors specifically, letting them authenticate and use the profile/skill-generation flow while still `pending` (unverified), and `status` flips to `active` on email-OTP confirmation (`auth.service.ts:211`) or immediately on social/GitHub signup (`social-auth.service.ts`), never on an admin approving a skill. Separately, `SkillProfile.status` (`pending|approved|rejected|disputed|superseded`) exists in the schema, but nothing in `applications` reads it to gate eligibility — because `applications` has no service/controller yet (§2). So FR-16 isn't actually contradicted by any running code today; only `User.role` is a confirmed, real gap. Fixing it is for whoever picks up the `identity` module next, informed by this document and `prd.md` FR-07.

## 6. Reliability and failure behavior

- **AI outage or low-confidence output**: because AI is advisory everywhere (ADR-014), "falling back to manual review" means exactly what it already means for every application — the owner sees the application without a fit analysis attached, never blocked.
- **GitHub API failure**: PR evidence stays `UNVERIFIED` (FR-34) until the on-demand validation job is retried; no evidence is silently marked otherwise.
- **Queue jobs**: bounded retries, dead-letter queue on exhaustion.
- **Idempotency**: PR validation and delivery-review-expiry jobs are safe to re-run — they compute state from source data (GitHub API response, `submittedAt` timestamp), not from mutable counters.

## 7. Known schema gaps (documentation only — not fixed here)

For completeness, since `data-model-and-erd.md` documents the target schema and will look substantially different from `prisma/schema.prisma` today:

- **Dead weight, safe to drop, nothing depends on it in code**: `Subscription`, `UsageTracker`, `AiMatchResult`, `SkillGapGuidance`, `Dispute` (+ their enums) — zero references anywhere in `src/modules/**` outside the schema itself.
- **Anticipated but unbuilt**: `AiValidationResult` / `AiValidationDecision` (the binary eligible/ineligible gating shape) exists in the schema, but `applications` has no service/controller yet — nothing to migrate away from, just don't build against it.
- **Real, load-bearing, needs an actual fix**: `User.role` (fixed enum) and `User.status` (pending-gate) — see §5.

---

## Module shape and boundaries (ratified unchanged from ADR-002)

Small module:

```text
projects/
  projects.module.ts
  projects.controller.ts
  projects.service.ts
  projects.service.spec.ts
  dto/
  mappers/             # only when needed
  README.md
```

Larger module:

```text
identity/
  identity.module.ts
  controllers/
  services/
  dto/
  integrations/
  security/
  validators/
  README.md
```

Optional folders are `events/`, `integrations/`, `jobs/`, `mappers/`, `repositories/`, `security/`, `utils/`, and `validators/`. Create them only for real files — no empty architecture placeholders.

**Boundaries:**

1. Each business capability has one owning module.
2. A module writes only its own tables.
3. Cross-module calls use services exported from the provider's NestJS module.
4. Never import another module's repository, client, security implementation, job, controller, mapper, validator, or utility.
5. `shared/` contains technical cross-cutting code only: configuration, database bootstrap, auth guards/decorators, errors, logging.
6. Events describe completed facts; each listener updates its own state.

**Enforcement:** `npm run check:architecture` rejects legacy layer folders, use-case/port filenames, private cross-module imports, persistence in controllers, external HTTP calls in controllers, missing module READMEs, and stale canonical guidance.
