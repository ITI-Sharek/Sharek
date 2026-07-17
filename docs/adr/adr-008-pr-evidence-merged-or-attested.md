# PR evidence: merged-or-attested rule, auto-flag on abuse

**Status:** PROPOSED — closed-without-merge attestation outcome is OPEN

A merged PR is strong repository-backed evidence. An owner may separately attest acceptance for work that is not merged or is not code. GitHub source state and owner attestation are independent dimensions and both remain visible.

The exact outcome when GitHub reports a PR closed without merge and the owner attests acceptance is unresolved. Implementations must not choose between accepted, attested, and flagged outcomes until the decision is recorded.

## Consequences

- On-demand validation must query GitHub; merge state cannot be self-reported.
- Public presentation must not summarize source state and attestation into one verified flag.
