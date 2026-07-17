# ShareK Documentation Rules

## Scope

These rules apply to everything under `docs/`.

## Canonical set

Only these files are canonical:

1. `README.md`
2. `product-spec.md`
3. `architecture.md`
4. `api-contracts.md`
5. `delivery-plan.md`
6. `decision-log.md`
7. `test-strategy.md`

`AGENTS.md` is governance. ADRs, operations, reference, audits, tooling, and
archives are supporting material and cannot introduce product requirements.

Large canonical documents are acceptable. Do not create a separate domain model,
PRD, product brief, backlog, sprint authority, or module delivery tracker.

## Reading order

A new teammate should need only:

1. `README.md`
2. `product-spec.md`
3. `architecture.md`
4. `api-contracts.md`
5. `delivery-plan.md`

Consult `decision-log.md` for decision authority and `test-strategy.md` for
verification. Use `audits/codebase-gap-report.md` only for current repository
evidence.

## Source precedence

1. Latest explicit human instruction.
2. `APPROVED` entries in `decision-log.md`.
3. Classified mandatory external constraints.
4. Human-approved `product-spec.md`.
5. `architecture.md` for technology/domain behavior.
6. `api-contracts.md` for public interfaces.
7. ADRs for narrow rationale.
8. Current code only for current implementation facts.
9. Supporting operations, references, and audits.
10. Archived/generated historical material.

While canonical files are `PROPOSED`, they cannot override approved decisions.
Historical generated artifacts never become authoritative because of their
detail or file count.

## Directory ownership

- `adr/` — narrow rationale records indexed by `adr/README.md`.
- `operations/` — current engineering, local-running, and API exercise guides.
- `reference/` — external constraints and research inputs.
- `audits/` — point-in-time implementation/documentation evidence; no requirements.
- `tooling/` — active agent and skill instructions; no product authority.
- `archive/claude-grill/` — superseded Claude-generated material.
- `archive/legacy/` — all other historical material and unused tooling.

Retired generated planning tooling must not be executed, regenerated, linked,
or recreated. Historical copies exist only under `archive/legacy/`.

## Product invariants

- AI Skill Inference and advisory Application Screening Fit are required in MVP.
- AI exposes evidence, confidence, and uncertainty and remains advisory.
- Every valid application reaches the owner; automatic rejection is deferred.
- NestJS owns business authority; FastAPI is a bounded AI service.
- GitHub is authoritative for connected code; repository-free projects work.
- Repository ownership requires verified maintainer permission.
- Individual contribution evidence is mandatory.
- One primary accepted contributor per task is the MVP default.
- Reviews publish when both submit or the review window expires.
- External admin review is distinct from ShareK/repository verification.
- Evidence source, review status, verification tier, and skill claims stay separate.
- Profiles can hold multiple trust signals and no global verified boolean.
- Contributors can participate without admin/profile verification.
- Real payments, company accounts, and team hiring are outside MVP.

## Editing rules

- Do not modify application code during documentation consolidation.
- Do not modify schemas, migrations, manifests, tests, generated code, Docker,
  CI, or environment files during documentation consolidation.
- Do not claim implementation without repository evidence.
- Mark uncertainty `OPEN`, `TBD`, or `UNVERIFIED`.
- Archive before deleting and use `git mv` for tracked files.
- Preserve unique history.
- Keep requirements in their owning canonical document.
- Update active links after moves.
- Historical audits remain point-in-time records and are not rewritten to hide
  earlier findings.

## Status vocabulary

- `PROPOSED`
- `APPROVED`
- `DESIGNED`
- `IN DEVELOPMENT`
- `IMPLEMENTED`
- `TESTED`
- `DEPLOYED`
- `DEFERRED`
- `REJECTED`

`OPEN`, `TBD`, and `UNVERIFIED` describe uncertainty, not delivery status.

## Completion checks

1. Confirm exactly seven canonical files.
2. Search active content for obsolete paths and unused planning systems.
3. Verify links and implementation claims.
4. Check technology, role, status, evidence, trust, and AI-authority consistency.
5. Validate the codebase gap report against current repository evidence.
6. Show moves, diff summary, modified files, and unresolved decisions.
7. Do not commit automatically.
