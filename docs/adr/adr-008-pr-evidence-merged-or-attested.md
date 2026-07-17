# PR evidence: merged-or-attested rule, auto-flag on abuse

**Status:** Accepted

A PR is strong evidence if it's **merged**, or if the owner **explicitly attests** acceptance for work that isn't merged (or isn't code at all) — either is sufficient, and the six-state `prState` enum (`MERGED | ACCEPTED_NOT_MERGED | OPEN | CLOSED_WITHOUT_MERGE | UNVERIFIED | FLAGGED`) is always shown publicly, not summarized away. If GitHub shows a PR closed-without-merge but the owner has attested acceptance anyway, the evidence auto-flags for admin review rather than silently trusting the attestation — an owner claiming credit for free labor while rejecting it on GitHub is exactly the integrity gap this catches. This is a real expansion beyond the old BMAD `DELIVERY` model, which only tracked a loose URL-format check with no merge-state distinction at all.

## Consequences

- Requires the on-demand GitHub PR-validation job (ADR: see `architecture.md` §4, `pr-validation` queue job) to actually query real PR state — evidence can't be self-reported as merged.
- The auto-flag is a deliberate friction point for owners, not just contributors — it's the one place in the evidence model that actively distrusts an owner's own attestation.
