# Research: Admin Skill Review Backend

## Decision: Skill Profiles Own Review State

`skill-profiles` should own the review workflow because it already owns generated skill candidates, approval state, and evidence snapshots.

**Rationale**: The data already lives with skill generation, and the review actions mutate the same aggregate.

**Alternatives considered**:
- Put review writes in `admin`: rejected because `admin` is only the HTTP boundary.
- Split review state across modules: rejected because it would duplicate ownership for one workflow.

## Decision: Add An Immutable Review Decision Table

Create a dedicated review decision table so every approve/reject/adjust action is preserved.

**Rationale**: The current `SkillProfile` row only stores the latest review metadata. The requirement says to store all review decisions, which needs an append-only audit record.

**Alternatives considered**:
- Store only the latest decision fields on `SkillProfile`: rejected because earlier decisions would be lost.

## Decision: Eligibility Reads Must Use Approved Skills Only

The eligibility contract should read only approved skills and ignore pending, rejected, or disputed claims.

**Rationale**: This is the trust boundary requested in the acceptance criteria and matches the existing approved-only public skill visibility pattern.

**Alternatives considered**:
- Let eligibility consumers filter ad hoc: rejected because the rule should be explicit and reusable.

## Decision: Admin Routes Stay Thin

The `admin` module should expose the HTTP routes and delegate to a focused review service rather than owning the workflow itself.

**Rationale**: This keeps route handling separate from review transitions and simplifies testing.

**Alternatives considered**:
- Put workflow logic in the controller: rejected because controllers should stay thin.
