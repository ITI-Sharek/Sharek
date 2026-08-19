# Architecture & Design Diagrams

Mermaid diagrams generated from the current implementation — `prisma/schema.prisma`,
`prisma/migrations/`, and `src/`. Every diagram names real tables, real classes, and
real routes, so it can be checked against the code rather than taken on trust.

GitHub, GitLab, and most Markdown viewers render Mermaid inline. In VS Code use the
built-in Markdown preview with a Mermaid extension.

| Document | What it answers |
| --- | --- |
| [`erd.md`](./erd.md) | What data exists, and how is it related? Context map plus nine per-context ER diagrams covering all 81 models, the logical (unconstrained) references, and the cross-cutting schema patterns. |
| [`high-level-architecture.md`](./high-level-architecture.md) | What are the moving parts? System context, container diagram, module landscape, request/delivery paths, the AI boundary, deployment, and the configuration surface. |
| [`architecture.md`](./architecture.md) | How is the backend built inside? Per-module layering, the shared technical kernel, module inventory with table ownership, the queue catalogue, integration adapters, realtime transport, and cross-cutting concerns. |
| [`class-diagram.md`](./class-diagram.md) | Which classes exist and what depends on what? Ten class diagrams covering the shared kernel and every major workflow slice, with real constructor dependencies. |
| [`sequence-diagrams.md`](./sequence-diagrams.md) | How does a flow actually run? Thirteen end-to-end sequences from registration through delivery approval, payment callbacks, and realtime notification delivery. |

## Related documents

| Document | Relationship |
| --- | --- |
| [`../architecture.md`](../architecture.md) | The architecture *decision* these diagrams depict |
| [`../database-plan.md`](../database-plan.md) | Ownership and audit rules behind the schema |
| [`../api-route-reference.md`](../api-route-reference.md) | Generated inventory of all 183 HTTP routes |
| [`../api-contracts.md`](../api-contracts.md) | Behaviour, error codes, and payload rules per contract |
| `../../../docs/architecture/domain-model/` | Shared product domain model (canonical vocabulary) |
| `../../../docs/adr/` | Accepted decisions referenced throughout these diagrams |

## Keeping them accurate

These are hand-maintained, not generated. When a change lands, update the affected
diagram in the same pull request:

| If you change… | Update |
| --- | --- |
| `prisma/schema.prisma` (a model, relation, or enum) | `erd.md` — the owning context section, and the patterns table if a new pattern appears |
| A controller's routes | Run `npm run docs:routes` and `npm run postman:generate` |
| A module's services or their dependencies | `class-diagram.md` for that slice |
| A workflow's steps, states, or failure handling | `sequence-diagrams.md` for that flow |
| A new module, queue, external service, or container | `architecture.md` and `high-level-architecture.md` |

The ADR references inside the diagrams point at `../../../docs/adr/`. When an ADR is
superseded, check whether a diagram is still describing the retired behaviour.
