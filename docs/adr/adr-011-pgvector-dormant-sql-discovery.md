# pgvector stays dormant; discovery is SQL filters only

**Status:** PROPOSED pending PD-001 checklist classification

Project/task discovery uses plain SQL filters for technology, difficulty, beginner friendliness, deadline, and open-task availability. No vector extension exists in the current Prisma schema. This remains the target unless the external checklist is classified as requiring semantic/vector retrieval.

## Consequences

- One fewer database extension to provision, migrate, and keep populated for a 6-person team on a fixed deadline.
- SQL filters are a limitation at scale but sufficient for the small MVP dataset.
- The schema is intentionally left in a state where adding pgvector later is additive (a new column + index), not a rewrite — "dormant" means deliberately deferred, not designed against.
