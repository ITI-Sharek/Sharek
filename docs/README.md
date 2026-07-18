# ShareK Documentation

**Status:** APPROVED

ShareK’s documentation is intentionally small. Seven files are canonical; all
other material supports operation, rationale, audit, tooling, or history.

## Start here

A new teammate reads only these five entry points:

1. [`README.md`](README.md) — this navigation and authority index.
2. [`product-spec.md`](product-spec.md) — what ShareK must do and what MVP excludes.
3. [`architecture.md`](architecture.md) — system architecture and complete domain model.
4. [`api-contracts.md`](api-contracts.md) — verified current and proposed target APIs.
5. [`delivery-plan.md`](delivery-plan.md) — vertical slices and release gates.

When needed:

- [`decision-log.md`](decision-log.md) contains binding human decisions and open
  decisions.
- [`test-strategy.md`](test-strategy.md) defines quality and release evidence.

## Canonical documents

| Document | Owns | Status |
|---|---|---|
| `README.md` | Navigation, reading order, ownership | APPROVED |
| `product-spec.md` | Product scope, requirements, public behavior, non-goals | APPROVED |
| `architecture.md` | Technology, domain glossary/contexts/entities/states/permissions/invariants | APPROVED |
| `api-contracts.md` | Current and target HTTP/API contracts | APPROVED; each contract retains its implementation label |
| `delivery-plan.md` | Vertical slices, dependencies, delivery gates | APPROVED |
| `decision-log.md` | Approved and open human decisions | Mixed by entry; approved entries are binding |
| `test-strategy.md` | Verification, security, AI evaluation, release evidence | APPROVED |

No other file may introduce product requirements.

## Supporting material

- [`adr/`](adr/) — narrow architecture rationale; indexed and subordinate to
  canonical decisions.
- [`operations/`](operations/) — engineering guide, module skeleton, local
  development/onboarding, and current Postman exercises.
- [`reference/`](reference/) — ITI checklist and strategic research questions.
- [`audits/`](audits/) — point-in-time reviews, current codebase gaps, and
  documentation migration history.
- [`tooling/`](tooling/) — active agent/skill instructions. These are not product
  documentation.
- [`archive/`](archive/) — superseded generated and legacy material retained for
  provenance only.

## Authority

When sources conflict:

1. latest explicit human instruction;
2. approved `decision-log.md` entry;
3. classified mandatory external constraint;
4. approved product specification;
5. architecture/domain model;
6. API contract within its boundary;
7. ADR rationale;
8. current code for current-state claims only;
9. supporting and archived material.

The canonical set was human-approved on 2026-07-18 under DOC-001. Approval makes
the target requirements and contracts authoritative; it does not change any
`PROPOSED`, `IN DEVELOPMENT`, or `IMPLEMENTED` label attached to an individual
feature, endpoint, entity, or module.

## Planning and current status

Implementation planning uses:

- [`delivery-plan.md`](delivery-plan.md) for vertical slices and planned work;
- [`audits/codebase-gap-report.md`](audits/codebase-gap-report.md) for verified
  repository facts.

Do not create a parallel backlog, sprint authority, module tracker, or generated
planning tree.

## Historical material

Historical content is intentionally retained before deletion:

- `archive/claude-grill/` preserves the superseded generated canonical set.
- `archive/legacy/` preserves earlier product, engineering, planning, binary
  source, generated-output, and unused tool artifacts.

Historical files may contain contradictory product models and broken links. They
are evidence of documentation history, not instructions for implementation.

## Maintenance

- Put requirements only in their canonical owner.
- Put narrow rationale in an ADR and index it.
- Put current runnable instructions in `operations/`.
- Put current repository observations in `audits/codebase-gap-report.md`.
- Archive superseded sources before removal.
- Never claim a feature is complete without repository and test evidence.
