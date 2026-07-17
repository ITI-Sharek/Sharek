# AI is advisory only; reject binary application gating

**Status:** APPROVED through AI-001, AI-002, and AI-003

AI Skill Inference and advisory Application Screening Fit are required in MVP. AI never blocks an application: every valid application reaches the owner regardless of output, failure, or confidence. AI inference is never labelled verified merely because a model produced it.

## Consequences

- Existing binary validation schema shapes are migration gaps and must not control application visibility.
- A thin public GitHub history can never silently exclude a contributor from being seen by an owner — the worst case is a weak-match note attached to an application the owner still reviews.
- Strict or automatic rejection is deferred; do not preserve a misleading strict-mode MVP contract.
