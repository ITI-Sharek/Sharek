# Reputation Module

Owns contributor reputation profiles, score history, and trusted completion
signals.

Reputation answers these questions:

- What trusted work has this contributor completed?
- How did their score change over time?
- Which reputation summary can the frontend show?
- Which reputation changes are auditable?

Current state:

- The module is registered but reputation workflows are not implemented yet.
- Add folders only when a sprint task creates real files.

Use this module for:

- Recording verified delivery outcomes.
- Recalculating reputation.
- Public contributor reputation summaries.
- Score history and auditability.

Reputation must be based on verified platform activity, not raw AI claims or
self-declared skills.

## Where To Put New Files

- `presentation/http/controllers`: public contributor reputation, score history,
  and admin reputation audit endpoints.
- `presentation/http/requests`: reputation query filters when needed.
- `presentation/http/responses`: public reputation summary and score history
  response shapes.
- `application/use-cases`: record verified completion, recalculate reputation,
  get reputation profile, get score history.
- `application/ports`: delivery outcome reader or event subscriber interface
  when needed.
- `domain/entities`: reputation profile, reputation record, score history entry.
- `domain/policies`: score calculation, cap/floor rules, weighting, decay, or
  fraud/suspicion policy.
- `infrastructure/persistence`: Prisma reputation repository and mapper.

## Boundaries

Reputation must update only reputation-owned records. It should not approve a
delivery, accept an application, or approve skills.

AI can help summarize evidence later, but raw AI claims should not directly
increase reputation.
