# Architecture Decision Records

Numbering continues from the archived `docs/archive/bmad-output/planning-artifacts/architecture/adr-001-backend-architecture.md` and `adr-002-standard-nestjs-module-architecture.md`. `adr-002` is still in force, unchanged. `adr-001` is superseded by `adr-003` below.

| ADR | Title | Status |
|---|---|---|
| [003](./adr-003-ai-via-nestjs-aiport.md) | AI integration via NestJS `AiPort`, not a separate FastAPI service | Accepted — supersedes old `adr-001` |
| [004](./adr-004-prisma-6.md) | Prisma 6 as the ORM | Accepted — ratifies old `adr-001`, unchanged |
| [005](./adr-005-auth-transport-cookie-refresh.md) | Auth transport: in-memory access token + httpOnly refresh cookie | Accepted |
| [006](./adr-006-links-only-evidence.md) | Contribution evidence is links-only, no file uploads | Accepted |
| [007](./adr-007-no-websockets-chat-mvp.md) | No WebSockets or real-time chat in MVP | Accepted |
| [008](./adr-008-pr-evidence-merged-or-attested.md) | PR evidence: merged-or-attested rule, auto-flag on abuse | Accepted |
| [009](./adr-009-owner-silence-14-day-unreviewed.md) | Owner silence: 14-day auto-`UNREVIEWED`, no penalty | Accepted |
| [010](./adr-010-blind-review-expiry-publish-one.md) | Blind review: expiry publishes a lone submission | Accepted |
| [011](./adr-011-pgvector-dormant-sql-discovery.md) | pgvector stays dormant; discovery is SQL filters only | Accepted |
| [012](./adr-012-defer-arabic-rtl-i18n-readiness.md) | Defer full Arabic/RTL; ship i18n-ready, English-only | Accepted |
| [013](./adr-013-reject-subscriptions-payments.md) | Reject subscriptions, tiers, and real payments | Accepted |
| [014](./adr-014-advisory-only-ai-reject-gating.md) | AI is advisory only; reject binary application gating | Accepted |
| [015](./adr-015-capability-model-no-fixed-role.md) | Capability model: no fixed `User.role`, roles derived per project | Accepted |
