# pgvector stays dormant; discovery is SQL filters only

**Status:** Accepted

Project/task discovery uses plain SQL filters (technology, difficulty, beginner-friendly, deadline, open-task availability) — no semantic search. pgvector isn't even added to `prisma/schema.prisma` yet, and stays that way for MVP. This closes out a real disagreement visible across the corpus itself: the legacy PDF and old BMAD ERD/backlog/sprints 1-3 assumed Pinecone; `docs/archive/bmad-output/planning-artifacts/architecture/adr-001-backend-architecture.md` and the later, self-correcting `sharek-ai-architecture-token-efficient-guide.md` had already argued for pgvector over Pinecone — this decision agrees with that internal correction and goes one step further by not activating pgvector at all in MVP.

## Consequences

- One fewer database extension to provision, migrate, and keep populated for a 6-person team on a fixed deadline.
- SQL filters are a real limitation at scale, but MVP scale (seed data: a handful of owners and projects, `seed-and-validation-plan.md`) doesn't need semantic ranking to be useful.
- The schema is intentionally left in a state where adding pgvector later is additive (a new column + index), not a rewrite — "dormant" means deliberately deferred, not designed against.
