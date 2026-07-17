# Owner silence: 14-day auto-`UNREVIEWED`, no penalty

**Status:** Accepted

If an owner never reviews submitted evidence, it auto-expires to `UNREVIEWED` after 14 days (reminders sent before the deadline) — the contributor takes **no reputation penalty**, and the profile can honestly show that the owner didn't review it. This is entirely net-new: the old BMAD `DELIVERY_REVIEW` entity has no expiry/deadline field at all, so owner silence previously just meant the submission sat forever with no defined outcome.

## Consequences

- Requires a scheduled job (`delivery-review-expiry`, `architecture.md` §4), not just a request-time check — the transition has to fire even if nobody visits the page.
- Repeated owner silence may warrant a reliability flag on the owner (`prd.md` FR-38) — the mechanism exists to protect contributors from owners who never engage, without punishing contributors for an owner's inaction.
- 14 days was chosen as a fixed window; there's no mechanism here for the owner to request an extension — that's a deliberate simplicity choice for MVP, not an oversight.
