# ShareK Current Slice Created Issues

**Status:** Stage 6 remote backlog created; clarified task cards on 2026-07-18
with one unresolved Project-field configuration gap
**Stage:** Stage 6 — Create Approved GitHub Backlog
**Created:** 2026-07-17
**Repository:** `ITI-Sharek/Sharek`
**Project:** `ShareK MVP Execution`, owner `ITI-Sharek`, project number `1`
**Source manifest:** `docs/audits/current-slice-issue-manifest.md`

This audit records the remote changes made after `APPROVE STAGE 5`. No humans
were assigned, no issue was moved to `In progress`, and no commits or pushes
were made.

## Milestone

| Field | Value |
|---|---|
| Milestone | `MVP S1 — Auth and Public Profile Foundation` |
| Number | `1` |
| URL | https://github.com/ITI-Sharek/Sharek/milestone/1 |
| State | `open` |
| Open issues | `10` |

## Created issues

| Key | Issue | Type | Labels | Project status |
|---|---:|---|---|---|
| S1-PARENT | [#5](https://github.com/ITI-Sharek/Sharek/issues/5) | Parent / coordination | `type:feature`, `area:cross-cutting`, `risk:security` | `Backlog` |
| S1-01 | [#6](https://github.com/ITI-Sharek/Sharek/issues/6) | Sub-issue | `type:feature`, `area:backend`, `risk:migration`, `risk:breaking-change` | `Ready` |
| S1-02 | [#7](https://github.com/ITI-Sharek/Sharek/issues/7) | Sub-issue | `type:feature`, `area:backend`, `risk:security`, `blocked` | `Backlog` |
| S1-03 | [#8](https://github.com/ITI-Sharek/Sharek/issues/8) | Sub-issue | `type:feature`, `area:backend`, `risk:security`, `risk:breaking-change`, `needs-decision`, `blocked` | `Backlog` |
| S1-04 | [#9](https://github.com/ITI-Sharek/Sharek/issues/9) | Sub-issue | `type:feature`, `area:backend`, `risk:external-api`, `risk:security`, `needs-decision`, `blocked` | `Backlog` |
| S1-05 | [#10](https://github.com/ITI-Sharek/Sharek/issues/10) | Sub-issue | `type:feature`, `area:backend`, `risk:security`, `needs-decision`, `blocked` | `Backlog` |
| S1-06 | [#11](https://github.com/ITI-Sharek/Sharek/issues/11) | Sub-issue | `type:feature`, `area:frontend`, `blocked` | `Backlog` |
| S1-07 | [#12](https://github.com/ITI-Sharek/Sharek/issues/12) | Sub-issue | `type:feature`, `area:frontend`, `risk:security`, `blocked` | `Backlog` |
| S1-08 | [#13](https://github.com/ITI-Sharek/Sharek/issues/13) | Sub-issue | `type:test`, `area:ai`, `risk:external-api`, `blocked` | `Backlog` |
| S1-09 | [#14](https://github.com/ITI-Sharek/Sharek/issues/14) | Sub-issue | `type:test`, `area:cross-cutting`, `blocked` | `Backlog` |

## 2026-07-18 clarity rewrite

After developer feedback that the original cards read like audit fixes rather
than build-from-scratch tasks, issues [#5](https://github.com/ITI-Sharek/Sharek/issues/5)
through [#14](https://github.com/ITI-Sharek/Sharek/issues/14) were rewritten
in place. The rewrite preserved issue numbers, milestone, Project membership,
parent/sub-issue relationships, and dependency relationships.

Updated titles:

- [#5](https://github.com/ITI-Sharek/Sharek/issues/5) — `Slice: Auth and Public Profile Foundation`
- [#6](https://github.com/ITI-Sharek/Sharek/issues/6) — `Task: Remove signup role selection and migrate account roles safely`
- [#7](https://github.com/ITI-Sharek/Sharek/issues/7) — `Task: Build contextual capability checks for protected actions`
- [#8](https://github.com/ITI-Sharek/Sharek/issues/8) — `Task: Move refresh tokens to secure httpOnly cookies`
- [#9](https://github.com/ITI-Sharek/Sharek/issues/9) — `Task: Restrict GitHub evidence to public least-privilege access`
- [#10](https://github.com/ITI-Sharek/Sharek/issues/10) — `Task: Build logged-out public profile API`
- [#11](https://github.com/ITI-Sharek/Sharek/issues/11) — `Task: Build frontend signup flow without owner/contributor roles`
- [#12](https://github.com/ITI-Sharek/Sharek/issues/12) — `Task: Build frontend auth shell and public profile page`
- [#13](https://github.com/ITI-Sharek/Sharek/issues/13) — `Task: Verify FastAPI skill-profile contract uses public advisory evidence`
- [#14](https://github.com/ITI-Sharek/Sharek/issues/14) — `Task: Run S1 integration verification and demo proof`

Each rewritten card now includes a user story, why the task exists, build scope,
out-of-scope items, dependencies, assignee/review guidance, expected files,
acceptance criteria, required commands, demo proof, and Project metadata.

## Project field values

All created issues were added to the GitHub Project. Supported fields were set
as follows.

| Key | Status | Size | Area | Slice | Risk |
|---|---|---|---|---|---|
| S1-PARENT | `Backlog` | `XL` | `Cross-cutting` | `S1 Auth and Public Profile` | `Security` |
| S1-01 | `Ready` | `M` | `Backend` | `S1 Auth and Public Profile` | `Data Migration` |
| S1-02 | `Backlog` | `M` | `Backend` | `S1 Auth and Public Profile` | `Security` |
| S1-03 | `Backlog` | `M` | `Backend` | `S1 Auth and Public Profile` | `Security` |
| S1-04 | `Backlog` | `M` | `Backend` | `S1 Auth and Public Profile` | `External API` |
| S1-05 | `Backlog` | `M` | `Backend` | `S1 Auth and Public Profile` | `Security` |
| S1-06 | `Backlog` | `S` | `Frontend` | `S1 Auth and Public Profile` | `Normal` |
| S1-07 | `Backlog` | `M` | `Frontend` | `S1 Auth and Public Profile` | `Security` |
| S1-08 | `Backlog` | `S` | `AI` | `S1 Auth and Public Profile` | `External API` |
| S1-09 | `Backlog` | `S` | `Cross-cutting` | `S1 Auth and Public Profile` | `Architecture` |

The manifest Priority values were intentionally not set in the Project because
the live `Priority` single-select field currently has no selectable options.
The intended values remain in each issue body:

- S1-PARENT: `P1 High`
- S1-01 through S1-04: `P0 Critical`
- S1-05 through S1-09: `P1 High`

## Relationships

### Parent/sub-issue relationships

Issue [#5](https://github.com/ITI-Sharek/Sharek/issues/5) is the parent of:

- [#6](https://github.com/ITI-Sharek/Sharek/issues/6)
- [#7](https://github.com/ITI-Sharek/Sharek/issues/7)
- [#8](https://github.com/ITI-Sharek/Sharek/issues/8)
- [#9](https://github.com/ITI-Sharek/Sharek/issues/9)
- [#10](https://github.com/ITI-Sharek/Sharek/issues/10)
- [#11](https://github.com/ITI-Sharek/Sharek/issues/11)
- [#12](https://github.com/ITI-Sharek/Sharek/issues/12)
- [#13](https://github.com/ITI-Sharek/Sharek/issues/13)
- [#14](https://github.com/ITI-Sharek/Sharek/issues/14)

### Dependency relationships

| Blocked issue | Blocked by |
|---|---|
| [#7](https://github.com/ITI-Sharek/Sharek/issues/7) S1-02 | [#6](https://github.com/ITI-Sharek/Sharek/issues/6) S1-01 |
| [#8](https://github.com/ITI-Sharek/Sharek/issues/8) S1-03 | [#6](https://github.com/ITI-Sharek/Sharek/issues/6) S1-01 |
| [#9](https://github.com/ITI-Sharek/Sharek/issues/9) S1-04 | [#6](https://github.com/ITI-Sharek/Sharek/issues/6) S1-01 |
| [#10](https://github.com/ITI-Sharek/Sharek/issues/10) S1-05 | [#6](https://github.com/ITI-Sharek/Sharek/issues/6) S1-01 |
| [#11](https://github.com/ITI-Sharek/Sharek/issues/11) S1-06 | [#6](https://github.com/ITI-Sharek/Sharek/issues/6) S1-01 |
| [#12](https://github.com/ITI-Sharek/Sharek/issues/12) S1-07 | [#8](https://github.com/ITI-Sharek/Sharek/issues/8) S1-03, [#10](https://github.com/ITI-Sharek/Sharek/issues/10) S1-05 |
| [#13](https://github.com/ITI-Sharek/Sharek/issues/13) S1-08 | [#9](https://github.com/ITI-Sharek/Sharek/issues/9) S1-04 |
| [#14](https://github.com/ITI-Sharek/Sharek/issues/14) S1-09 | [#6](https://github.com/ITI-Sharek/Sharek/issues/6), [#7](https://github.com/ITI-Sharek/Sharek/issues/7), [#8](https://github.com/ITI-Sharek/Sharek/issues/8), [#9](https://github.com/ITI-Sharek/Sharek/issues/9), [#10](https://github.com/ITI-Sharek/Sharek/issues/10), [#11](https://github.com/ITI-Sharek/Sharek/issues/11), [#12](https://github.com/ITI-Sharek/Sharek/issues/12), [#13](https://github.com/ITI-Sharek/Sharek/issues/13) |

## Verification performed

- Repository permission verified as `ADMIN`.
- Existing issues and milestones were checked before creation; none existed.
- Required labels were present before issue creation.
- Milestone `#1` exists and contains the ten created issues.
- Issues `#5` through `#14` exist exactly once.
- No issue has an assignee.
- All ten created issues are in the GitHub Project.
- Supported Project fields were independently read back from the Project.
- Issue [#5](https://github.com/ITI-Sharek/Sharek/issues/5) was verified to
  have nine sub-issues.
- All dependency relationships for issues [#7](https://github.com/ITI-Sharek/Sharek/issues/7)
  through [#14](https://github.com/ITI-Sharek/Sharek/issues/14) were read back
  from GitHub and matched the expected blockers.
- Duplicate issue-title query returned no duplicates.

## Failures and recovery

The first creation script timed out while setting Project field values. At that
point the milestone and all ten issues had already been created. The script was
not rerun blindly. Live state was re-inspected, then an idempotent repair set
the supported Project fields and created the sub-issue/dependency relationships.

The first repair attempt failed before mutation because the Project number was
passed to GraphQL as a string instead of an integer. It made no remote changes.
The corrected repair succeeded.

## Unresolved problems

1. The live `Priority` Project field has no selectable options, so Priority
   values could not be set through supported Project field-value operations.
   Manual governance fix required: add or restore `P0 Critical`, `P1 High`,
   `P2 Medium`, and `P3 Low` options to the existing `Priority` field, then set
   the values listed above. Do not create a duplicate Priority field.
2. S1-03 still requires a refresh-token compatibility decision.
3. S1-04 still requires broad GitHub token/snapshot remediation policy.
4. S1-05 still requires public-profile route compatibility policy.
5. Stage 7 still requires real GitHub usernames, primary/secondary skills,
   availability, module familiarity, and ownership constraints before remote
   assignment.

## Recommended assignment order

Do not assign remotely until Stage 7 approval.

1. Start with S1-01 only.
2. After S1-01 API/persistence shape is stable, prepare S1-02, S1-03, and
   S1-06.
3. S1-04 and S1-05 can be designed in parallel, but their final implementation
   must account for S1-01.
4. S1-07 waits for S1-03 and S1-05.
5. S1-08 waits for S1-04 payload containment.
6. S1-09 waits for S1-01 through S1-08.
