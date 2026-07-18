# Architecture Decision Records

ADRs record narrow rationale. They do not count as canonical entry points and
cannot override `decision-log.md`, `product-spec.md`, or `architecture.md`.

| ADR | Title | Status/authority |
|---|---|---|
| [004](adr-004-prisma-6.md) | Prisma 6 as ORM | IMPLEMENTED current architecture |
| [005](adr-005-auth-transport-cookie-refresh.md) | In-memory access token and httpOnly refresh cookie | PROPOSED target |
| [007](adr-007-no-websockets-chat-mvp.md) | No required realtime chat in MVP | REJECTED; superseded by ADR-016 |
| [008](adr-008-pr-evidence-merged-or-attested.md) | PR evidence and owner attestation | PROPOSED; closed-without-merge outcome OPEN |
| [009](adr-009-owner-silence-14-day-unreviewed.md) | Owner silence after 14 days | APPROVED through PD-002 |
| [010](adr-010-blind-review-expiry-publish-one.md) | Blind review publication | APPROVED through PD-002 |
| [011](adr-011-pgvector-dormant-sql-discovery.md) | SQL discovery without required vector search | REJECTED in part by ADR-017; SQL discovery survives |
| [012](adr-012-defer-arabic-rtl-i18n-readiness.md) | English-first localization readiness | PROPOSED pending PD-001 |
| [013](adr-013-reject-subscriptions-payments.md) | No subscriptions or real payments in MVP | APPROVED product direction |
| [014](adr-014-advisory-only-ai-reject-gating.md) | Required advisory AI; no automatic rejection | APPROVED through AI-001–003 |
| [015](adr-015-capability-model-no-fixed-role.md) | Contextual capabilities, no fixed product role | APPROVED through SEC-002 |
| [016](adr-016-websocket-collaboration.md) | Durable collaboration with WebSocket delivery | APPROVED through COL-001 |
| [017](adr-017-bounded-rag-single-agent.md) | PostgreSQL/pgvector evidence RAG with one bounded agent | APPROVED through AI-004 |
| [018](adr-018-selected-private-repository-evidence.md) | Selected private-repository evidence | APPROVED through SEC-003 |

Superseded ADRs are retained under `../archive/claude-grill/adr/`. Historical
generated ADRs remain under `../archive/legacy/` and have no active authority.
