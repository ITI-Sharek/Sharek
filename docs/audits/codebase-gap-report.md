# ShareK Codebase Gap Report

**Status:** Current-state audit
**Observed:** 2026-07-17
**Normative sources:** `../product-spec.md`, `../architecture.md`,
`../api-contracts.md`, `../decision-log.md`

This report records repository evidence. It does not introduce requirements or
serve as a second delivery plan. Planned work belongs in `../delivery-plan.md`.

## 1. Repository baseline

- Backend: NestJS 11, Prisma 6, PostgreSQL, BullMQ; ten migration directories.
- Frontend: TanStack Start/React scaffold. `frontend/package.json` has no real
  test command and only the base router/start dependencies.
- Bounded AI service: NestJS FastAPI skill-profile client exists; the external
  FastAPI repository is not present in this monorepo.
- No generated OpenAPI source was found. Current contracts must be verified from
  controllers, DTOs, `backend/sharek-api.http`, and the Postman collection.

## 2. Module evidence

| Module | Evidence | Assessment |
|---|---|---|
| `identity` | 41 files; auth/session/social/email services and tests | IN DEVELOPMENT |
| `github` | 17 files; OAuth, repository, evidence services | IN DEVELOPMENT |
| `skill-profiles` | 17 files; service, jobs/client, DTOs, tests | IN DEVELOPMENT |
| `contributor-profiles` | 11 files; controller/service/tests | IN DEVELOPMENT |
| `projects` | 8 files; controller/service/DTOs/tests | IN DEVELOPMENT |
| `ai` | 6 files; facade/client integration | IN DEVELOPMENT |
| `reputation` | 3 files; service/module/README | IN DEVELOPMENT, partial |
| `health` | 4 files; controller/module/response | IMPLEMENTED |
| `contribution-tasks` | module and README only | PROPOSED/scaffold |
| `applications` | module and README only | PROPOSED/scaffold |
| `delivery-reviews` | module and README only | PROPOSED/scaffold |
| `admin` | module and README only | PROPOSED/scaffold |
| `reviews` | no module | PROPOSED/missing |
| `notifications` | no module | PROPOSED/missing |

The presence of a module directory is not evidence that its workflow exists.

## 3. Confirmed gaps

### Identity and authorization

- Registration persists a fixed `User.role` (`owner | contributor | admin`),
  conflicting with contextual product capabilities.
- Email verification currently uses account status. This is not evidence of an
  admin participation gate, but target persistence must keep the concerns
  separate.
- Refresh-token transport currently uses the request body rather than the
  proposed httpOnly-cookie design.

### GitHub permissions and ownership

- Contributor OAuth uses `read:user user:email repo`.
- `repo` exposes private-repository access and write capability and violates the
  approved public-evidence/least-privilege boundary.
- The target repository-free project path is not evidenced end to end.

### Public profile and trust

- `ContributorProfilesController` has a class-level `AccessTokenGuard`.
- `getByUsername` requires `CurrentUser`, so logged-out profile viewing returns
  401 instead of satisfying API-001.
- Current shape lacks independent evidence source/review status/verification
  tier, multiple source-explained trust signals, external projects, and complete
  reputation dimensions.

### Contribution loop

- Task, application, delivery-review, and admin modules are scaffolds.
- No accepted-assignment model implementing one primary contributor was
  verified.
- No complete versioned individual-evidence workflow was verified.
- No blind bilateral review module was found.
- No complete append-only reputation event model was verified.

### AI

- Skill-profile generation exists in part.
- Advisory application-fit analysis is not implemented.
- Current schema includes binary validation concepts that must not be used to
  build automatic rejection.
- A locked evaluation set and approved quality thresholds were not found.

### External-project evidence

- No approved external-project submission/review workflow was found.
- Storage, scanning, limits, retention, and removal remain open.

### Frontend

- The frontend is a base scaffold, not evidence of the required screens.
- There is no functional test runner configured.
- No logged-out profile, trust labels, application loop, delivery loop, review,
  external-project, or AI fit UI was verified.

## 4. Documentation/tooling gap

`backend/scripts/check-architecture.mjs` still requires and parses the former
root tracker and engineering-guide paths. The approved documentation-only
consolidation does not change that JavaScript file. Until a separately authorized
tooling update is made, `npm run check:architecture` is expected to fail its
documentation-path checks even if application architecture is unchanged.

## 5. Evidence refresh rule

Update this report only when repository evidence changes. Each update should
name the inspected files/tests and the observation date. Do not copy planned
tasks from `delivery-plan.md`; link to the relevant vertical slice instead.
