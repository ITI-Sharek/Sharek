# ShareK Current Slice Assignment Plan

**Status:** Approved; assignment expanded after backlog-clarity feedback
**Stage:** Stage 7 — Team Assignment Plan
**Created:** 2026-07-17
**Repository:** `ITI-Sharek/Sharek`
**Project:** `ShareK MVP Execution`, owner `ITI-Sharek`, project number `1`
**Milestone:** `MVP S1 — Auth and Public Profile Foundation`

This plan uses the Stage 6 S1 backlog and the team information provided by the
human. It records the approved initial assignment performed after:

```text
APPROVE STAGE 7 AND ASSIGN
```

No issue was moved to `In progress`, and no commit or push was performed.
On 2026-07-18, after feedback that the cards were unclear for developers, all
planned owners were assigned to their issues while dependency-blocked issues
remained in `Backlog`.

## Team input normalized

| GitHub username | Primary skill | Secondary skill | Availability | Known modules | Constraints |
|---|---|---|---|---|---|
| `@Abdullah2elsman` | Backend | NestJS | Unspecified | Unspecified | Should not own AI |
| `@Hatem-Mah` | Backend | Testing | Unspecified | Unspecified | Should not own AI |
| `@Root12335` | Backend | Unspecified | Unspecified | Unspecified | None provided |
| `@tadrs` | AI | Unspecified | Unspecified | Unspecified | Should not own Frontend |
| `@KariMuhammad` | Frontend | DevOps | Unspecified | Unspecified | Should not own AI |
| `@ahmed-lotfi` | Frontend | UI/UX | Unspecified | Frontend testing | Should not own Backend or AI |

All six usernames were verified through the GitHub API.

Because availability was not provided, this plan assumes no one should receive
more than one active implementation issue at a time. Future assignments are
sequenced rather than made active immediately.

## Assignment rules enforced

- One `In progress` implementation issue per developer.
- Blocked issues stay `Backlog` until dependencies are satisfied.
- Only dependency-unblocked issues may be set `Ready`.
- Reviews should be cross-owned and should not be performed only inside the same
  skill silo.
- Avoid simultaneous edits to the same central files, especially identity/auth,
  Prisma migrations, frontend router/auth state, and GitHub/AI boundary code.
- Testing stays inside each implementation issue, not as a separate late cleanup.
- AI work begins only after backend public-evidence containment is ready.
- AI remains advisory and never owns business transitions.

## Immediate remote action after approval

If approved, perform only this remote assignment immediately:

| Issue | Primary assignee | Project status | Reason |
|---|---|---|---|
| [#6](https://github.com/ITI-Sharek/Sharek/issues/6) S1-01 — Remove fixed product role from registration and preserve admin access | `@Abdullah2elsman` | keep `Ready` | This is the only dependency-unblocked implementation issue and fits Backend/NestJS. |

Do not assign the blocked issues remotely yet unless the human explicitly wants
future owners assigned while issues remain blocked. The safer operating model is
to keep blocked issues unassigned until their blockers are resolved, while using
the planned-owner table below for coordination.

## Planned primary ownership by issue

| Issue | Planned primary owner | When it may become Ready | Rationale |
|---|---|---|---|
| [#6](https://github.com/ITI-Sharek/Sharek/issues/6) S1-01 | `@Abdullah2elsman` | Now | Backend/NestJS work; no AI ownership. |
| [#7](https://github.com/ITI-Sharek/Sharek/issues/7) S1-02 | `@Root12335` | After [#6](https://github.com/ITI-Sharek/Sharek/issues/6) is merged/closed or its auth shape is stable enough for a follow-on PR | Backend capability guardrail work. |
| [#8](https://github.com/ITI-Sharek/Sharek/issues/8) S1-03 | `@Hatem-Mah` | After [#6](https://github.com/ITI-Sharek/Sharek/issues/6) | Backend auth/session work with strong testing/security emphasis. |
| [#9](https://github.com/ITI-Sharek/Sharek/issues/9) S1-04 | `@Root12335` | After [#6](https://github.com/ITI-Sharek/Sharek/issues/6), preferably after [#7](https://github.com/ITI-Sharek/Sharek/issues/7) is not in active implementation | Backend GitHub containment. `@tadrs` reviews AI-boundary impact but should not own backend implementation. |
| [#10](https://github.com/ITI-Sharek/Sharek/issues/10) S1-05 | `@Abdullah2elsman` | After [#6](https://github.com/ITI-Sharek/Sharek/issues/6), and only after `@Abdullah2elsman` is no longer active on [#6](https://github.com/ITI-Sharek/Sharek/issues/6) | Backend public-profile API; unblocks frontend route. |
| [#11](https://github.com/ITI-Sharek/Sharek/issues/11) S1-06 | `@KariMuhammad` | After [#6](https://github.com/ITI-Sharek/Sharek/issues/6) API contract is stable | Frontend onboarding plus DevOps awareness; no AI ownership. |
| [#12](https://github.com/ITI-Sharek/Sharek/issues/12) S1-07 | `@ahmed-lotfi` | After [#8](https://github.com/ITI-Sharek/Sharek/issues/8) and [#10](https://github.com/ITI-Sharek/Sharek/issues/10) | Frontend route/UI/testing work; respects no Backend/AI ownership constraint. |
| [#13](https://github.com/ITI-Sharek/Sharek/issues/13) S1-08 | `@tadrs` | After [#9](https://github.com/ITI-Sharek/Sharek/issues/9) | AI contract verification; avoids frontend ownership. |
| [#14](https://github.com/ITI-Sharek/Sharek/issues/14) S1-09 | `@Hatem-Mah` | After [#6](https://github.com/ITI-Sharek/Sharek/issues/6) through [#13](https://github.com/ITI-Sharek/Sharek/issues/13) | Integrated verification is testing-heavy. `@KariMuhammad` and `@tadrs` should support DevOps/frontend and AI evidence. |

## Review ownership

| Issue | Required review emphasis | Recommended reviewers |
|---|---|---|
| [#6](https://github.com/ITI-Sharek/Sharek/issues/6) S1-01 | migration safety, auth compatibility, admin preservation | `@Hatem-Mah`, `@Root12335` |
| [#7](https://github.com/ITI-Sharek/Sharek/issues/7) S1-02 | capability model and forbidden paths | `@Abdullah2elsman`, `@Hatem-Mah` |
| [#8](https://github.com/ITI-Sharek/Sharek/issues/8) S1-03 | cookie/CSRF/CORS tests and frontend contract | `@Abdullah2elsman`, `@KariMuhammad` |
| [#9](https://github.com/ITI-Sharek/Sharek/issues/9) S1-04 | public-only evidence, GitHub scope, AI payload boundary | `@tadrs`, `@Hatem-Mah` |
| [#10](https://github.com/ITI-Sharek/Sharek/issues/10) S1-05 | guest-safe projection and frontend contract | `@ahmed-lotfi`, `@Hatem-Mah` |
| [#11](https://github.com/ITI-Sharek/Sharek/issues/11) S1-06 | frontend onboarding behavior and role-removal UX | `@ahmed-lotfi`, `@Abdullah2elsman` |
| [#12](https://github.com/ITI-Sharek/Sharek/issues/12) S1-07 | UI/accessibility, auth client, guest profile route | `@KariMuhammad`, `@Hatem-Mah` |
| [#13](https://github.com/ITI-Sharek/Sharek/issues/13) S1-08 | advisory-only AI, public-only input, offline tests | `@Root12335`, `@Abdullah2elsman` |
| [#14](https://github.com/ITI-Sharek/Sharek/issues/14) S1-09 | full command evidence and demo proof | `@KariMuhammad`, `@tadrs`, one backend reviewer not already active |

Reviewers are recommendations only. Stage 7 remote assignment should set issue
assignees, not force GitHub reviewers until PRs exist.

## Execution sequence

### Wave 1 — start now after approval

- Assign [#6](https://github.com/ITI-Sharek/Sharek/issues/6) to
  `@Abdullah2elsman`.
- Keep [#6](https://github.com/ITI-Sharek/Sharek/issues/6) as `Ready`.
- Keep [#7](https://github.com/ITI-Sharek/Sharek/issues/7) through
  [#14](https://github.com/ITI-Sharek/Sharek/issues/14) as `Backlog`.

Allowed parallel non-implementation preparation:

- `@Hatem-Mah` may draft test cases for [#8](https://github.com/ITI-Sharek/Sharek/issues/8).
- `@Root12335` may review the [#6](https://github.com/ITI-Sharek/Sharek/issues/6) migration/auth design.
- `@KariMuhammad` and `@ahmed-lotfi` may review frontend implications of the
  registration/auth contract.
- `@tadrs` may inspect the AI boundary expectations for [#13](https://github.com/ITI-Sharek/Sharek/issues/13), without implementing it before [#9](https://github.com/ITI-Sharek/Sharek/issues/9).

### Wave 2 — after S1-01 stabilizes

Set `Ready` and assign only if each developer has no current `In progress`
implementation issue:

- [#7](https://github.com/ITI-Sharek/Sharek/issues/7) to `@Root12335`
- [#8](https://github.com/ITI-Sharek/Sharek/issues/8) to `@Hatem-Mah`
- [#10](https://github.com/ITI-Sharek/Sharek/issues/10) to `@Abdullah2elsman`
- [#11](https://github.com/ITI-Sharek/Sharek/issues/11) to `@KariMuhammad`

Do not start [#9](https://github.com/ITI-Sharek/Sharek/issues/9) while
`@Root12335` is actively editing shared auth/capability files for
[#7](https://github.com/ITI-Sharek/Sharek/issues/7), unless the implementation
plans prove file collision is low.

### Wave 3 — after blockers clear

- [#9](https://github.com/ITI-Sharek/Sharek/issues/9) to `@Root12335` after
  [#7](https://github.com/ITI-Sharek/Sharek/issues/7) is no longer active.
- [#12](https://github.com/ITI-Sharek/Sharek/issues/12) to `@ahmed-lotfi` after
  [#8](https://github.com/ITI-Sharek/Sharek/issues/8) and
  [#10](https://github.com/ITI-Sharek/Sharek/issues/10).
- [#13](https://github.com/ITI-Sharek/Sharek/issues/13) to `@tadrs` after
  [#9](https://github.com/ITI-Sharek/Sharek/issues/9).

### Wave 4 — final verification

- [#14](https://github.com/ITI-Sharek/Sharek/issues/14) to `@Hatem-Mah` after
  all S1 implementation issues close.
- `@KariMuhammad` supports CI/frontend verification.
- `@tadrs` supports AI contract evidence.
- A backend developer not active on a final fix reviews backend evidence.

## File-collision controls

- [#6](https://github.com/ITI-Sharek/Sharek/issues/6),
  [#7](https://github.com/ITI-Sharek/Sharek/issues/7), and
  [#8](https://github.com/ITI-Sharek/Sharek/issues/8) can all touch identity or
  shared auth files. Do not keep them all in active implementation at the same
  time without a branch/file split.
- [#8](https://github.com/ITI-Sharek/Sharek/issues/8) and
  [#12](https://github.com/ITI-Sharek/Sharek/issues/12) share the auth transport
  contract. Backend contract must lead frontend integration.
- [#10](https://github.com/ITI-Sharek/Sharek/issues/10) and
  [#12](https://github.com/ITI-Sharek/Sharek/issues/12) share the public profile
  API contract. Backend contract must be real before frontend final integration.
- [#9](https://github.com/ITI-Sharek/Sharek/issues/9) and
  [#13](https://github.com/ITI-Sharek/Sharek/issues/13) share the GitHub-to-AI
  evidence boundary. Backend containment must land before AI verification.
- Any Prisma migration must be created from current `master` after previous S1
  migrations are merged.

## Remote actions after approval and clarification

After `APPROVE STAGE 7 AND ASSIGN`, the initial approved remote action was
performed:

1. Assigned [#6](https://github.com/ITI-Sharek/Sharek/issues/6) to
   `@Abdullah2elsman`.
2. Confirmed [#6](https://github.com/ITI-Sharek/Sharek/issues/6) remains
   `Ready`.
3. Confirmed [#7](https://github.com/ITI-Sharek/Sharek/issues/7) through
   [#14](https://github.com/ITI-Sharek/Sharek/issues/14) remain `Backlog` and
   unassigned.
4. Confirmed no issue was set to `In progress`.

After later backlog-clarity feedback, all planned owners were assigned to make
ownership visible on the issue list. Dependency-blocked issues were not moved to
`Ready` or `In progress`; they remain `Backlog` and carry the `blocked` label.

| Issue | Current assignee | Current Project status |
|---|---|---|
| [#6](https://github.com/ITI-Sharek/Sharek/issues/6) | `@Abdullah2elsman` | `Ready` |
| [#7](https://github.com/ITI-Sharek/Sharek/issues/7) | `@Root12335` | `Backlog` |
| [#8](https://github.com/ITI-Sharek/Sharek/issues/8) | `@Hatem-Mah` | `Backlog` |
| [#9](https://github.com/ITI-Sharek/Sharek/issues/9) | `@Root12335` | `Backlog` |
| [#10](https://github.com/ITI-Sharek/Sharek/issues/10) | `@Abdullah2elsman` | `Backlog` |
| [#11](https://github.com/ITI-Sharek/Sharek/issues/11) | `@KariMuhammad` | `Backlog` |
| [#12](https://github.com/ITI-Sharek/Sharek/issues/12) | `@ahmed-lotfi` | `Backlog` |
| [#13](https://github.com/ITI-Sharek/Sharek/issues/13) | `@tadrs` | `Backlog` |
| [#14](https://github.com/ITI-Sharek/Sharek/issues/14) | `@Hatem-Mah` | `Backlog` |

## Open risks

1. Availability is unspecified for every developer, so scheduling cannot be
   capacity-based.
2. `@Root12335` has no secondary skill or constraints recorded.
3. The Project `Priority` field still has no options; Priority cannot be set
   remotely until governance fixes the existing field.
4. [#8](https://github.com/ITI-Sharek/Sharek/issues/8),
   [#9](https://github.com/ITI-Sharek/Sharek/issues/9), and
   [#10](https://github.com/ITI-Sharek/Sharek/issues/10) each carry unresolved
   decisions from Stage 6.
