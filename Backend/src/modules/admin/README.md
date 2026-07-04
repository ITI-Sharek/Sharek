# Admin Module

Owns admin-facing workflows and queues.

Use this module for:

- Pending skill review queues.
- Manual eligibility review queues.
- Reports and disputes.
- Moderation actions.
- Audit views.

Admin workflows may call other modules' public use cases. They must not update
another module's tables directly.

