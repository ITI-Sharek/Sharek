# Reject subscriptions, tiers, and real payments

**Status:** APPROVED product direction

No subscription tiers, commissions, usage caps, premium AI access, or real payment processing belong in MVP. A simulated payment demonstration may be considered only if an officially classified evaluation constraint requires it and must be labelled simulated.

## Consequences

- Existing subscription/usage schema models are target migration gaps; this ADR does not authorize schema changes.
- Removes an entire two-sided pricing problem (who pays, how much, enforced how) the team has no validated demand data for — building it now would be speculative work competing with the one loop that actually needs to prove itself.
- Required AI features are not tier-gated.
