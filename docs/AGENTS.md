# ShareK Documentation Agent Rules

## Scope

These rules apply to everything under `docs/`.

## Current Situation

The current documentation was generated and modified through a Claude
`grill-with-docs` session.

The result is not automatically approved or authoritative.

Codex must independently verify:

- Product coherence.
- Internal consistency.
- Compatibility with explicit product decisions.
- Compatibility with the actual repository.
- Whether documents are canonical, supporting, generated, or obsolete.

## Goal

Maintain a small number of comprehensive canonical documents.

Large canonical documents are preferred over many overlapping summaries.

Do not preserve files merely because effort was spent creating them.

## Proposed Canonical Documents

The preferred canonical set is:

1. `README.md`
2. `product-spec.md`
3. `domain-model.md`
4. `architecture.md`
5. `api-contracts.md`
6. `delivery-plan.md`
7. `test-strategy.md`
8. `decision-log.md`
9. `migration-notes.md`

This is a proposed target, not permission to move files without an audit.

## Supporting Directories

- `adr/` — accepted and proposed architecture decisions.
- `operations/` — local development, Postman, onboarding, deployment.
- `planning/` — BMAD outputs, epics, stories, and sprint material.
- `reference/` — datasets, fixture rules, examples, and AI evaluation material.
- `audits/` — documentation and codebase gap reports.
- `archive/legacy/` — superseded historical documents.
- `archive/claude-grill/` — generated material that is useful for traceability
  but is not canonical.

## Source Precedence

When sources conflict, use this order:

1. Latest explicit user decisions.
2. Approved entries in `decision-log.md`.
3. Current product specification.
4. Current architecture specification.
5. Actual codebase behavior, but only when describing current implementation.
6. Archived legacy documentation.
7. Generated summaries, pitches, sprint plans, and agent outputs.

Existing code does not silently override approved target requirements.
It may instead represent an implementation gap.

## Product Invariants

Preserve these decisions unless explicitly reopened:

- ShareK builds credible professional reputation from evidence-backed
  contributions.
- The primary MVP user is a beginner contributor.
- A user may act as both project owner and contributor.
- GitHub is authoritative for code when connected.
- Projects may exist before a GitHub repository exists.
- AI is advisory by default.
- Owners remain accountable for application acceptance.
- Individual contribution evidence is mandatory.
- Reviews remain blind until both sides submit or the review window expires.
- Company accounts and team hiring are outside MVP.
- Real payments and escrow are outside MVP.
- Frontend uses TanStack Start.
- Core backend uses NestJS modular clean architecture.
- PostgreSQL is the primary database.
- A Python AI service is optional and must be explicitly justified.

## Editing Rules

- Do not modify application code during documentation consolidation.
- Do not modify migrations, package files, tests, Docker, CI, or environment
  files during documentation consolidation.
- Do not claim a feature is implemented without repository evidence.
- Mark uncertainty as `OPEN`, `TBD`, or `UNVERIFIED`.
- Archive before deleting.
- Prefer `git mv` for tracked files.
- Preserve meaningful history.
- Do not duplicate the same requirement across canonical documents.
- Do not invent missing decisions.
- Do not silently resolve contradictions.
- Update internal links after moving files.

## Status Vocabulary

Use only:

- PROPOSED
- APPROVED
- DESIGNED
- IN DEVELOPMENT
- IMPLEMENTED
- TESTED
- DEPLOYED
- DEFERRED
- REJECTED

## Completion Requirements

Before completing documentation changes:

1. Search for broken relative links.
2. Search for obsolete filenames.
3. Search for contradictory technology names.
4. Verify every implementation claim.
5. Produce an old-to-new document mapping.
6. List unresolved decisions.
7. Show the final Git diff.
8. Do not commit automatically.