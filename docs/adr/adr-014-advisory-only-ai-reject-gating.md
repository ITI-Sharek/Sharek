# AI is advisory only; reject binary application gating

**Status:** Accepted

AI never blocks an application — every fit analysis reaches the owner regardless of the AI's output, and the word "verified" is never applied to an AI inference alone. This directly reverses the legacy PDF's stated "core differentiator" (a binary ELIGIBLE/INELIGIBLE gate that blocked applications from ever reaching the owner) and the old BMAD PRD/ERD, which had the identical rule as a hard business constraint (`APPLICATION` blocked from the owner if `AI_VALIDATION_RESULT.decision = 'ineligible'`). It's also the reason `applications` was deliberately left unbuilt rather than built against the `AiValidationResult`/`AiValidationDecision` shape already sitting in the schema (`architecture.md` §7) — that shape anticipates exactly the model this ADR rejects.

## Consequences

- `AiValidationResult` and `AiValidationDecision` (`eligible | ineligible | review_needed`) stay in the schema as dead weight alongside the other unused models (ADR-013's consequences) — `applications` should be built against `AiOutput` (`data-model-and-erd.md`) instead, not this shape.
- A thin public GitHub history can never silently exclude a contributor from being seen by an owner — the worst case is a weak-match note attached to an application the owner still reviews.
- `STRICT` screening mode (`prd.md` FR-30) is a config flag that changes how prominently a weak match is flagged to the owner, never a mode that removes the owner from the decision.
