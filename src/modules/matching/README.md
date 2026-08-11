# Matching Module

The matching module owns the owner-facing contributor matching workflow and
`AiMatchResult` writes. It assembles a fixed published Contribution Request
snapshot, approved contributor skills, verified reputation summaries, and
bounded evidence capsules before calling the exported AI facade.

```text
published Contribution Request
  -> ContributorMatchingQueue / Worker
  -> ContributorMatchingService
  -> AiService -> FastAPI Contributor Matching Agent
  -> validated ranked recommendations -> AiMatchResult
```

The backend owns entitlement enforcement, candidate eligibility, evidence
allowlisting, deterministic tie-breaking, Silver/Gold limits (5/10), owner
authorization, and persistence. FastAPI returns recommendations only; its
scores and explanations never decide Application eligibility or Assignment.
Bronze owners receive no matching results. Silver/Gold owners may invite a
stored match through the module's public seam; invitations only emit a
deduplicated Notification and never create an Application or Assignment.
Gold owners automatically notify best matches after generation. The module
also exposes Gold-only reverse recommendations for contributors, using the
same AI contract with one contributor candidate per published actionable
Request. The generate route is also exposed for an owner retry or local
development when the worker is disabled.
