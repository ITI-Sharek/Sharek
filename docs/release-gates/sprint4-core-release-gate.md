# Sprint 4 Core Release Gate (S4-B11 / #57)

## Decision

The deterministic core workflow passes at the reviewed revisions below. The
release remains **merge-blocked** until the AI prerequisite PR is merged into
`AI_Agents/main`; no Materials implementation may merge before that point.

| Repository | Reviewed revision | Delivery state |
| --- | --- | --- |
| `ITI-Sharek/Sharek` | `869fe477d9291e268c326900ef9b8f44fdbc2ffa` plus this gate change | B11 PR pending |
| `ITI-Sharek/Frontend` | `fa870f79878a742fc3c25c691dbd078a11cd90a8` | merged to `master` |
| `ITI-Sharek/AI_Agents` | `7b1943c5adc77ccd4fe079c56bda3d92dfe47eaa` | PR #7 pending against `main` |

The earlier remote AI feature branch was not used as release evidence because
it contained unrelated accumulated work. PR #7 is a clean delivery from the
canonical default branch and is the exact AI revision verified here.

## Automated Demo Exercise

The exercise uses controller-level Supertest contracts, real owning services
with deterministic persistence fakes, controlled clocks, immutable contract
fixtures, and frontend/AI boundary tests. It intentionally makes no paid model
call and does not treat a live provider as release authority.

1. Owner creates a draft Contribution Request, publishes it explicitly, and
   the public discovery service returns Required and Preferred Requirements.
2. Contributor submits an Application. The response is immediately
   `PENDING_OWNER_REVIEW`, and the owner queue/detail routes expose it.
3. Owner accepts or declines without an assessment. Acceptance creates one
   immutable Assignment and closes sibling pending Applications; decline uses
   explicit human feedback. Assessment state is absent from the decision
   preconditions.
4. Owner separately requests Advisory Fit. Fixed Requirement and authorized
   Evidence snapshots cross the authenticated service boundary. The AI result
   covers every Requirement once and cannot contain eligibility, score, rank,
   recommendation, Application status, or a decision. Pending, unavailable,
   and no-evidence results never hide or gate owner actions.
5. Contributor submits a private Proposal and later a new immutable Version in
   response to the owner's append-only revision request.
6. Owner accepts the latest Version. The transaction creates an attributed,
   owner-controlled draft Contribution Request and creates no Application,
   Assignment, reserved position, quota use, or selection priority.
7. Owner publishes the resulting Request. Public detail exposes contributor
   attribution while the Frontend explicitly distinguishes attribution from
   Assignment and priority.

The fixture pair under `test/fixtures/sprint4-core/` is shared release evidence
for the NestJS-to-FastAPI camel-case contract. The verifier rejects missing
routes, unauthorized citations, changed Requirement classification, incomplete
coverage, and prohibited decision-authority fields.

## Commands

From the backend checkout:

```bash
SHAREK_FRONTEND_ROOT=/path/to/Frontend \
SHAREK_AI_ROOT=/path/to/AI_Agents \
npm run test:release-gate:s4-core

npx jest --runInBand \
  test/contribution-requests.e2e-spec.ts \
  test/contribution-request-public-lifecycle.e2e-spec.ts \
  test/applications.e2e-spec.ts \
  test/contribution-proposals.e2e-spec.ts \
  src/modules/applications/applications.service.spec.ts \
  src/modules/applications/services/advisory-fit-assessment.service.spec.ts \
  src/modules/ai/integrations/advisory-fit.client.spec.ts \
  src/modules/contribution-proposals/contribution-proposals.service.spec.ts
```

Backend full gates:

```bash
npx prisma generate
npx prisma validate
npm run check:architecture
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run test:api-clients
npm run test:migrations
npm run build
```

Frontend full gates at the reviewed `master` revision:

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm exec tsc --noEmit
pnpm test
pnpm run build
```

AI prerequisite gates at PR #7:

```bash
uv venv .venv --python 3.11
uv pip install --python .venv/bin/python -r requirements.txt
PYTHONPATH=src .venv/bin/python -m pytest -q
PYTHONPATH=src .venv/bin/python -m compileall -q src
```

## Authorization And Privacy Review

- Draft/write routes require authentication and owning Project authorization.
- Public discovery excludes drafts, cancelled/closed Requests, and archived
  Projects. Private Proposal history is limited to its contributor and current
  Project owner.
- Owner Decision routes re-check current ownership and terminal state in the
  transaction. Advisory Fit does not participate in that authorization path.
- The AI endpoint requires the shared bearer token, accepts only backend-fixed
  snapshots, and rejects citations outside `allowedEvidenceIds`.
- Public Application and Proposal projections exclude provider prompts,
  private evidence, unfinished owner fields, internal audit metadata, and
  credentials.
- Proposal attribution is public only after the resulting Request is published
  and conveys no Assignment or priority.

## Database And Migration Review

No schema change is introduced by B11. The gate deploys and checks the existing
Sprint 4 migrations through the isolated PostgreSQL migration harness. The
Application, Owner Decision, Assignment, assessment, Proposal, immutable
Version, revision, attribution, audit, and notification constraints remain the
authoritative persistence controls.

The harness passed against PostgreSQL 16. A clean deploy also applied all 30
migrations successfully against `pgvector/pgvector:pg16` and reported the
schema up to date. Plain `postgres:16` is intentionally insufficient because it
does not ship the required `vector` extension.

## Merge Conditions

1. AI PR #7 passes independent high-effort review and merges to
   `AI_Agents/main`.
2. Re-run this gate with `SHAREK_AI_ROOT` at that merged revision.
3. B11 PR CI and the cross-repository verifier pass without fixture drift.
4. Only then merge the B11 PR; `Closes #57` may close the gate issue.
5. B12 Materials work may proceed only after #57 is closed by that merge.

## Residual Risks

- Deterministic provider fakes prove the strict service boundary, not external
  provider availability or account quota. A deployment smoke may check those
  operational concerns but cannot change the decision-neutral contract.
- Cross-repository verification needs read access to all three repositories;
  it is run from a trusted multi-repo workspace rather than assuming one
  repository's default GitHub token can clone the other private repositories.
