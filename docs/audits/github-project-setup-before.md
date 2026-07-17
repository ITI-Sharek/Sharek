# GitHub Project Setup — Before State

**Observed:** 2026-07-17

**Status:** Point-in-time repository-governance audit

No GitHub Project, repository label, template, issue, or workflow mutation was
performed during this inspection. Configuration stopped because existing fields
conflict with the requested option sets.

## Authorization and detected targets

| Property | Detected value |
|---|---|
| Authenticated user | `KariMuhammad` |
| Token scopes | `gist`, `project`, `read:org`, `repo`, `workflow` |
| Repository | `ITI-Sharek/Sharek` |
| Repository URL | `https://github.com/ITI-Sharek/Sharek` |
| Repository permission | `ADMIN` |
| Project owner | `ITI-Sharek` (`Organization`) |
| Matching open projects | Exactly one |
| Project title | `ShareK MVP Execution` |
| Project number | `1` |
| Project node ID | `PVT_kwDOEdQVm84BdrPg` |
| Project URL | `https://github.com/orgs/ITI-Sharek/projects/1` |
| Project visibility | Private |
| Project edit permission | `viewerCanUpdate: true` |
| Project items | `0` |

The repository was detected from `origin`, which points to
`https://github.com/ITI-Sharek/Sharek.git`. The token has the required `project`
scope and both repository/project edit checks passed.

## Existing fields

| Field | Type | Field ID | Options or configuration | Assessment |
|---|---|---|---|---|
| Title | `TITLE` | `PVTF_lADOEdQVm84BdrPgzhYLHbY` | Built in | Present |
| Assignees | `ASSIGNEES` | `PVTF_lADOEdQVm84BdrPgzhYLHbc` | Built in | Present |
| Status | `SINGLE_SELECT` | `PVTSSF_lADOEdQVm84BdrPgzhYLHbg` | See below | Present; do not duplicate |
| Labels | `LABELS` | `PVTF_lADOEdQVm84BdrPgzhYLHbk` | Built in | Present |
| Linked pull requests | `LINKED_PULL_REQUESTS` | `PVTF_lADOEdQVm84BdrPgzhYLHbo` | Built in | Present |
| Milestone | `MILESTONE` | `PVTF_lADOEdQVm84BdrPgzhYLHbs` | Built in | Present |
| Repository | `REPOSITORY` | `PVTF_lADOEdQVm84BdrPgzhYLHbw` | Built in | Present |
| Reviewers | `REVIEWERS` | `PVTF_lADOEdQVm84BdrPgzhYLHb4` | Built in | Present |
| Parent issue | `PARENT_ISSUE` | `PVTF_lADOEdQVm84BdrPgzhYLHb8` | Built in | Present |
| Sub-issues progress | `SUB_ISSUES_PROGRESS` | `PVTF_lADOEdQVm84BdrPgzhYLHcA` | Built in | Present |
| Created | `CREATED` | `PVTF_lADOEdQVm84BdrPgzhYLHcE` | Built in | Present |
| Updated | `UPDATED` | `PVTF_lADOEdQVm84BdrPgzhYLHcI` | Built in | Present |
| Closed | `CLOSED` | `PVTF_lADOEdQVm84BdrPgzhYLHcM` | Built in | Present |
| Priority | `SINGLE_SELECT` | `PVTSSF_lADOEdQVm84BdrPgzhYLH5o` | No options | **Conflict** |
| Size | `SINGLE_SELECT` | `PVTSSF_lADOEdQVm84BdrPgzhYLH5s` | `XS`, `S`, `M`, `L`, `XL` | **Conflict: extra `XL`** |
| Estimate | `NUMBER` | `PVTF_lADOEdQVm84BdrPgzhYLH5w` | Built in/template field | Present, not requested |
| Iteration | `ITERATION` | `PVTIF_lADOEdQVm84BdrPgzhYLH50` | Five active iterations | Optional existing field |

### Existing Status options

| Option | Option ID | Target comparison |
|---|---|---|
| Backlog | `f75ad846` | Exact |
| Ready | `e18bf179` | Exact |
| In progress | `47fc9ee4` | Capitalization differs from `In Progress` |
| In review | `aba860b9` | Capitalization differs from `In Review` |
| Blocked | `dcd5b865` | Exact |
| Done | `98236657` | Exact |

All six semantic states exist. No second Status field is needed or permitted.
The standard `gh project` command surface does not provide a safe documented
option-edit command for correcting capitalization, so these two names remain a
manual checklist item for a future authorized continuation.

### Existing Priority options

The existing `Priority` field has no options. It conflicts with the required
`P0 Critical`, `P1 High`, `P2 Medium`, and `P3 Low` configuration. Because a
field with the same name already exists, it must not be duplicated.

### Existing Size options

| Option | Option ID |
|---|---|
| XS | `911790be` |
| S | `b277fb01` |
| M | `86db8eb3` |
| L | `853c8207` |
| XL | `2d0801e2` |

`XL` conflicts with the requested four-option set. No mutation was attempted.

### Existing Iteration configuration

| Iteration | Iteration ID | Start | Duration |
|---|---|---|---|
| Iteration 1 | `381c7c80` | 2026-07-17 | 14 days |
| Iteration 2 | `54cf5c95` | 2026-07-31 | 14 days |
| Iteration 3 | `d2c335bc` | 2026-08-14 | 14 days |
| Iteration 4 | `b6a8f1bb` | 2026-08-28 | 14 days |
| Iteration 5 | `955c1297` | 2026-09-11 | 14 days |

There are no completed iterations. Iteration is retained as an optional
template field and is not treated as workflow Status.

## Repository link and items

- Linked repositories: `ITI-Sharek/Sharek`.
- Desired repository link already exists; no link mutation is necessary.
- Existing project items: none.
- No feature issues were created.

## Existing views

| View | Layout | Filter | Grouping observed |
|---|---|---|---|
| Current iteration | Board | `iteration:@current` | Status columns |
| Next iteration | Board | `iteration:@next` | Priority grouping; Status columns |
| Prioritized backlog | Board | None | Priority grouping; Status columns |
| Roadmap | Roadmap | None | None reported |
| In review | Table | `status:"In review"` | None |
| My items | Table | `assignee:@me` | None |

The Iteration and Roadmap views were inspected only. Nothing was deleted or
reconfigured.

## Existing built-in workflows

The official API exposes workflow names and enabled state, but not enough
configuration detail to verify every target transition or auto-add filter.

| Workflow | Workflow ID | Number | Enabled |
|---|---|---|---|
| Auto-add sub-issues to project | `PWF_lADOEdQVm84BdrPgzgZTvhE` | 10 | Yes |
| Auto-add to project | `PWF_lADOEdQVm84BdrPgzgZTvhQ` | 13 | Yes |
| Auto-close issue | `PWF_lADOEdQVm84BdrPgzgZTvhA` | 9 | Yes |
| Item added to project | `PWF_lADOEdQVm84BdrPgzgZTvhM` | 12 | Yes |
| Item closed | `PWF_lADOEdQVm84BdrPgzgZTvg4` | 7 | Yes |
| Pull request linked to issue | `PWF_lADOEdQVm84BdrPgzgZTvhI` | 11 | Yes |
| Pull request merged | `PWF_lADOEdQVm84BdrPgzgZTvg8` | 8 | Yes |

## Existing repository labels

| Label | Description |
|---|---|
| `bug` | Something isn't working |
| `documentation` | Improvements or additions to documentation |
| `duplicate` | This issue or pull request already exists |
| `enhancement` | New feature or request |
| `good first issue` | Good for newcomers |
| `help wanted` | Extra attention is needed |
| `invalid` | This doesn't seem right |
| `question` | Further information is requested |
| `wontfix` | This will not be worked on |

None of the requested namespaced type, area, or risk labels exist. The requested
`blocked`, `needs-decision`, and `good-first-task` helper labels also do not
exist. Similar default labels are not treated as duplicates because their names
and governance semantics differ.

## Existing repository templates

- Issue templates: none under `.github/ISSUE_TEMPLATE/`.
- Pull-request template: `.github/pull_request_template.md` exists and contains
  the backend-oriented PR checklist.
- Required cross-cutting implementation-task and bug forms are missing.
- `.github/ISSUE_TEMPLATE/config.yml` is missing.

## Missing configuration and stop reason

The following requested fields are missing entirely:

- `Area`
- `Slice`
- `Risk`

The following existing fields conflict with requested options:

- `Priority`: field exists but has zero options.
- `Size`: field contains the unrequested `XL` option.

The existing `Status` field is usable but has capitalization differences for
`In progress` and `In review`. Required labels and issue forms are also missing,
and the target views/workflow settings cannot be confirmed from the supported
API response.

Per the explicit instruction to stop when an existing same-name field has
conflicting options, no field, label, template, view, workflow, link, item, or
issue mutation was attempted after discovery.

## Read-only commands executed

```bash
git remote -v
gh auth status
gh repo view --json nameWithOwner,url,viewerPermission
gh project list --owner ITI-Sharek --format json
gh project view 1 --owner ITI-Sharek --format json
gh project field-list 1 --owner ITI-Sharek --format json
gh project item-list 1 --owner ITI-Sharek --format json --limit 100
gh label list --repo ITI-Sharek/Sharek --json name,color,description --limit 200
gh api graphql # project authorization, fields/options, iterations, repository link, views, and workflows
gh api repos/ITI-Sharek/Sharek/contents/.github
```
