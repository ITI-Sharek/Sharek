# Admin Module

Owns admin-facing workflows and queues.

Admin answers these questions:

- Which items need manual review?
- Which reports or disputes need moderation?
- What audit view does an admin need to understand a decision?
- Which admin action should be routed to the module that owns the real state?

Current state:

- The module is registered but admin workflows are not implemented yet.
- Add folders only when a sprint task creates real files.

Use this module for:

- Pending skill review queues.
- Manual eligibility review queues.
- Reports and disputes.
- Moderation actions.
- Audit views.

Admin workflows may call other modules' public use cases. They must not update
another module's tables directly.

## Where To Put New Files

- `presentation/http/controllers`: admin queue, manual review, moderation,
  dispute, report, and audit endpoints.
- `presentation/http/requests`: review decision, moderation action, dispute
  update, report action request DTOs.
- `presentation/http/responses`: queue item, audit detail, moderation result,
  report/dispute response shapes.
- `application/use-cases`: list queues, assign review, submit admin decision,
  moderate report, resolve dispute.
- `application/ports`: readers for applications, skill profiles, reports,
  disputes, or audit snapshots.
- `domain/policies`: admin permission policy, moderation policy, dispute
  resolution policy.
- `infrastructure/persistence`: admin queue/read-model repository if admin
  needs its own persisted queue or audit view.

## Boundaries

Admin is an orchestration and review module. It does not become the owner of
skills, applications, deliveries, or reputation just because an admin is taking
the action.

Example: if an admin approves a skill, the final state change should go through
`skill-profiles`.
