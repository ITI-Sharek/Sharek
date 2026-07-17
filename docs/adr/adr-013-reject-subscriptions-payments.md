# Reject subscriptions, tiers, and real payments

**Status:** Accepted

No subscription tiers, commissions, or usage caps anywhere in the product, and no real payment processing — a simulated payment flow exists only if a specific evaluation rubric is later confirmed to require one, clearly labelled as simulated. This is a full reversal of both the legacy PDF and the old BMAD PRD/ERD/backlog, which had a complete Bronze/Silver/Gold two-sided tier system (`Subscription`, `UsageTracker` entities, ~10 FRs, an entire dedicated sprint) baked in as core scope, including AI features gated behind paid tiers (priority matching, skill-gap guidance).

## Consequences

- Removes real, already-migrated database models with zero application-code dependents — `Subscription`, `UsageTracker`, and the tier-gated `AiMatchResult`/`SkillGapGuidance` models are confirmed dead weight (`architecture.md` §7), safe to drop from the schema without touching any service logic.
- Removes an entire two-sided pricing problem (who pays, how much, enforced how) the team has no validated demand data for — building it now would be speculative work competing with the one loop that actually needs to prove itself.
- AI features are the same for every user — there's no "Gold tier gets better guidance" tier gap to design around, which simplifies the AI surface considerably (one advisory fit-analysis feature, not four tier-gated agents).
