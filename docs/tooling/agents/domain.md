# Domain Documentation Rules for Agents

This file is tooling guidance, not a product or domain source of truth.

## Required sources

When work touches ShareK terminology, entities, permissions, or state:

1. Read `docs/product-spec.md` for product behavior.
2. Read the domain sections of `docs/architecture.md` for glossary, bounded
   contexts, entities, state machines, permissions, evidence, reputation, and
   invariants.
3. Read `docs/api-contracts.md` for external interface vocabulary.
4. Read `docs/decision-log.md` when a decision is disputed or marked open.
5. Inspect current code and `docs/audits/codebase-gap-report.md` when describing
   implementation state.

Do not look for `CONTEXT-MAP.md`, per-folder `CONTEXT.md`, a separate
`domain-model.md`, or generated planning output. Those are not part of ShareK’s
documentation system.

## Vocabulary rule

Use the glossary in `docs/architecture.md`. Do not silently introduce synonyms
for application, assignment, evidence source, review status, verification tier,
skill claim, trust signal, or reputation event. If a required term is missing,
record the gap rather than inventing a competing model.

## Conflict rule

Precedence is:

1. latest explicit human instruction;
2. approved decision-log entry;
3. product specification;
4. architecture/domain model;
5. API contract within its boundary;
6. ADR rationale;
7. current code only for current-state claims.

Surface conflicts explicitly. An ADR, agent instruction, archived artifact, or
current schema cannot silently override an approved target decision.
