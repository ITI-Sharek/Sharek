# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is multi-context: `backend/` (NestJS) and `frontend/` (TanStack Start) are distinct codebases with their own conventions, glossaries, and architectural decisions, sharing one git repo.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it points at one `CONTEXT.md` per context (`backend/CONTEXT.md`, `frontend/CONTEXT.md`). Read whichever is relevant to the topic; read both for work that spans the API contract between them.
- **`docs/adr/`** at the repo root — system-wide decisions (e.g. the monorepo migration itself, cross-cutting API contracts).
- **`backend/docs/adr/`** — decisions scoped to the NestJS backend.
- **`frontend/docs/adr/`** — decisions scoped to the TanStack frontend.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT-MAP.md
├── docs/adr/                    ← system-wide decisions (migration, cross-repo API contract)
├── backend/
│   ├── CONTEXT.md
│   └── docs/adr/                ← backend-scoped decisions
└── frontend/
    ├── CONTEXT.md
    └── docs/adr/                ← frontend-scoped decisions
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids. Where backend and frontend name the same concept differently (e.g. a DTO field vs. a UI label), prefer the backend's term as canonical unless `CONTEXT-MAP.md` says otherwise — the backend owns the data model.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR — root-level, `backend/docs/adr/`, or `frontend/docs/adr/` — surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
