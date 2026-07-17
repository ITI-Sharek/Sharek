# Blind review: expiry publishes a lone submission

**Status:** Accepted

Owner and contributor each submit a 3-dimension review of the other, hidden from both sides until either both submit or the review window expires. If only one side submits by expiry, that review **still publishes alone**, labelled "Counterpart did not submit a review" — it is never withheld just because the other party refused to reciprocate. Extreme ratings require a written rationale. This is a real evolution from the old BMAD model, which had no blind mechanism at all (a single unidirectional owner→contributor rating, with Sprint 5 explicitly marking even basic anonymization as "TBD"), through the v2 Brief's 7-dimension bilateral version, down to this simplified 3-dimension form.

## Consequences

- Prevents a specific manipulation: a party can't suppress negative feedback about themselves by simply not submitting their own review.
- Non-submitters get no review-completion incentive — there's no reward for waiting out the window.
- Published reviews are immutable except through admin invalidation (`prd.md` FR-44) — never silently editable after the fact.
