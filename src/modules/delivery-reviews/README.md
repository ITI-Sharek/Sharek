# Delivery Reviews Module

Owns work delivery after an application is accepted.

Delivery reviews answers these questions:

- Has the contributor submitted a PR or delivery link?
- Is the delivery pending, approved, rejected, or needing changes?
- What feedback did the owner give?
- Which verified delivery event should other modules react to?

Current state:

- The module is registered but delivery workflows are not implemented yet.
- Add folders only when a sprint task creates real files.

Use this module for:

- Pull request link submission.
- Delivery status.
- Owner approval or rejection.
- Ratings and written feedback.
- Publishing delivery-approved events.

This module should not calculate reputation directly. Reputation updates belong
to the reputation module reacting to approved delivery.

## Where To Put New Files

- `presentation/http/controllers`: submit delivery, review delivery, list
  deliveries, delivery detail endpoints.
- `presentation/http/requests`: PR link submission, approval, rejection, rating,
  and feedback request DTOs.
- `presentation/http/responses`: delivery detail, review result, and delivery
  list response shapes.
- `application/use-cases`: submit PR link, approve delivery, reject delivery,
  request changes, list owner review queue.
- `application/ports`: accepted application reader, project/task reader, event
  publisher.
- `domain/entities`: delivery entity and delivery review entity.
- `domain/policies`: owner review policy, rating policy, PR link validation,
  delivery status transition policy.
- `domain/events`: `DeliveryApproved` and similar business facts.
- `infrastructure/persistence`: Prisma delivery/review repository and mapper.

## Boundaries

This module emits facts about approved work. It does not calculate reputation
scores. Reputation should react to approved delivery events and write its own
tables.
