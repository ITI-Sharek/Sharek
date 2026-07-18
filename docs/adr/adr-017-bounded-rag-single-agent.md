# PostgreSQL/pgvector evidence RAG with one bounded agent

**Status:** APPROVED through AI-004

ShareK adds pgvector to PostgreSQL for permission-filtered retrieval of compact,
attributable evidence documents. One bounded agent may gather permitted
evidence, call deterministic tools, retrieve relevant documents, and return
structured skill/application-fit recommendations.

## Consequences

- PostgreSQL is the source of truth; vector rows are rebuildable indexes.
- Retrieval documents carry contributor, skill, repository, revision/freshness,
  visibility, permission, evidence IDs, extractor version, and limitations.
- RAG does not replace SQL project/task discovery or approve advanced semantic
  matching.
- NestJS validates recommendations and alone owns final business transitions.
- Three-or-more-agent orchestration and multimodal analysis remain lower priority
  until the P0 loop, RAG, and single-agent evaluation pass.
