# Backend and Postman Refactor Audit

Date: 2026-08-10

## Scope and source of truth

The audit covered every backend module under `src`, all files containing
`@Controller`, their validated DTOs, guards, owning services, mappers, and
focused tests. The existing Postman artifacts were treated as generated
consumers, not as API authority. `client/` was out of scope.

## Findings

- The architecture checker found no controller importing Prisma or integration
  clients and no cross-module import of private feature files. Controllers
  delegate through owning or exported services.
- The largest workflow services remain `applications.service.ts` (1,363
  lines), `contribution-proposals.service.ts` (1,230),
  `contribution-tasks.service.ts` (1,118), `project-publication.service.ts`
  (944), and `material-analysis.service.ts` (845). Their multi-write decisions
  already use owning-module transactions and focused companion services. A
  broad split would move transaction context across new seams, so it was
  deliberately deferred without a demonstrated behavioral defect.
- `materials.controller.ts` is the largest controller (261 lines), but its
  handlers are HTTP adapters for multipart input, headers, pipes, and response
  streaming rather than business decisions. No structural split was justified
  by the current contract.
- The GitHub OAuth controller mixed an unauthenticated browser/provider redirect
  with authenticated repository evidence routes and repeated the same
  whitespace-aware `fullName` validation in five handlers. This was the small,
  behavior-preserving refactor selected for implementation.
- Global DTO whitelisting, stable application-error serialization, explicit
  response presenters, secret redaction, owning-module write boundaries, and
  transaction use were already established. The focused GitHub query DTO closes
  the identified repeated-validation gap without changing valid input values.
- The prior collection had 142 requests for 138 unique controller routes: four
  duplicate examples, an inconsistent `base_url` variable, stale bodies,
  misplaced Materials routes, sparse auth/description metadata, hardcoded
  personal credentials, and no strict duplicate/obsolete/malformed URL gate.
- Both Postman sync entry points read developer-specific credential files or
  paths and could perform a network upload implicitly. They are now offline by
  default, repository-relative, and upload only after an explicit flag plus
  environment-provided identifiers and API key.

## Safe implementation stages

1. Extract the mixed GitHub callback controller and introduce a feature-local
   query DTO with focused compatibility tests.
2. Extract and persist a normalized controller inventory without starting the
   application or infrastructure.
3. Deterministically rebuild the collection, environment, and guide from that
   inventory while retaining DTO-valid examples and confirmed response-field
   captures.
4. Replace unsafe sync behavior and add strict offline checks for coverage,
   duplicates, URLs, auth, headers, bodies, scripts, variables, and committed
   credential-like values.
5. Run architecture, lint, type, test, build, Prisma, JSON, and Postman gates.

All five stages are complete. No schema change, migration, public route change,
or frontend edit was required.
