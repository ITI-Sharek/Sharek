# Owner silence: 14-day auto-`UNREVIEWED`, no penalty

**Status:** APPROVED through PD-002

If an owner never reviews submitted evidence, it becomes `UNREVIEWED` after 14 days, with reminders before the deadline. The contributor takes no reputation penalty, and the profile may honestly show that the owner did not review it.

## Consequences

- Requires a scheduled job (`delivery-review-expiry`, `../architecture.md` §5), not just a request-time check — the transition has to fire even if nobody visits the page.
- Repeated owner silence may warrant a reliability flag on the owner without punishing the contributor.
- 14 days was chosen as a fixed window; there's no mechanism here for the owner to request an extension — that's a deliberate simplicity choice for MVP, not an oversight.
