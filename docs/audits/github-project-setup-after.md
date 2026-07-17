# GitHub Project Setup — After State

**Observed:** 2026-07-17

**Status:** Point-in-time repository-governance audit

The live configuration was revalidated after Stage 0 approval. The fields and
labels recorded below were already present at revalidation time; no remote
mutation was repeated during that pass.

## Detected target and authorization

| Property | Validated value |
|---|---|
| Authenticated user | `KariMuhammad` |
| Token scopes | `gist`, `project`, `read:org`, `repo`, `workflow` |
| Repository | `ITI-Sharek/Sharek` |
| Repository permission | `ADMIN` |
| Project owner | `ITI-Sharek` |
| Project title | `ShareK MVP Execution` |
| Project number | `1` |
| Project node ID | `PVT_kwDOEdQVm84BdrPg` |
| Project edit permission | `viewerCanUpdate: true` |
| Project items | `0` |

## Remote mutations completed

### Project fields created

Each field was created only after confirming its name was absent. Fields were
listed after every creation to verify that no duplicate existed.

| Field | Field ID | Options |
|---|---|---|
| Area | `PVTSSF_lADOEdQVm84BdrPgzhYLYDk` | Frontend; Backend; AI; DevOps; Documentation; Cross-cutting |
| Slice | `PVTSSF_lADOEdQVm84BdrPgzhYLYKc` | S0 Workflow and CI; S1 Auth and Public Profile; S2 GitHub and AI Skill Inference; S3 Project Publishing; S4 Tasks and AI Fit; S5 Evidence and Reputation |
| Risk | `PVTSSF_lADOEdQVm84BdrPgzhYLYQU` | Normal; Security; Data Migration; External API; Architecture |

The final Project field count is 20. Exactly one field exists for each of
`Status`, `Priority`, `Size`, `Iteration`, `Area`, `Slice`, and `Risk`.

### Repository labels created

Existing default labels were retained. These 19 previously missing labels were
created with descriptions:

| Group | Labels |
|---|---|
| Type | `type:feature`, `type:bug`, `type:test`, `type:refactor`, `type:docs`, `type:chore` |
| Area | `area:frontend`, `area:backend`, `area:ai`, `area:devops`, `area:docs`, `area:cross-cutting` |
| Risk | `risk:security`, `risk:migration`, `risk:external-api`, `risk:breaking-change` |
| Workflow helpers | `blocked`, `needs-decision`, `good-first-task` |

No status, priority, size, slice, or iteration label was created.

## Existing configuration preserved

- The existing Status field `PVTSSF_lADOEdQVm84BdrPgzhYLHbg` was retained with `Backlog`, `Ready`, `In progress`, `In review`, `Blocked`, and `Done`.
- The existing Priority field `PVTSSF_lADOEdQVm84BdrPgzhYLH5o` was retained and not duplicated.
- The existing Size field `PVTSSF_lADOEdQVm84BdrPgzhYLH5s` was retained with `XS`, `S`, `M`, `L`, and `XL`.
- The existing Iteration field `PVTIF_lADOEdQVm84BdrPgzhYLH50` and all five iterations were retained.
- The repository link to `ITI-Sharek/Sharek` was already present and remains present.
- `Current iteration`, `Next iteration`, `Prioritized backlog`, `Roadmap`, `In review`, and `My items` were preserved.
- All seven previously enabled built-in workflows remain enabled.
- All nine pre-existing default repository labels remain present.
- No existing project item was changed; the Project still contains zero items.

## Local files created or updated

| File | Result |
|---|---|
| `.github/ISSUE_TEMPLATE/implementation-task.yml` | Created with all required implementation fields and validations |
| `.github/ISSUE_TEMPLATE/bug.yml` | Created with reproducibility, impact, security/data, and regression-test fields |
| `.github/ISSUE_TEMPLATE/config.yml` | Created; blank issues disabled |
| `.github/pull_request_template.md` | Updated in place as a cross-cutting template; lowercase path preserved |
| `docs/operations/github-project.md` | Created with field, sizing, issue/PR, label, view, and automation guidance |
| `docs/audits/github-project-setup-before.md` | Created by the read-only discovery run |
| `docs/audits/github-project-conflict-resolution.md` | Created with binding decisions and mutation evidence |
| `docs/audits/github-project-manual-ui-checklist.md` | Created with only unsupported/unverifiable UI actions |
| `docs/audits/github-project-setup-after.md` | Created as this final record |

All three YAML files parse successfully with Ruby's safe YAML loader. No
application source, database schema, migration, Docker, CI, dependency manifest,
or canonical documentation file was modified.

## Mutations skipped

### Existing Priority field options

The official GraphQL schema exposes `updateProjectV2Field`, and the supported
mutation was attempted in place against the existing Priority field with the
approved four options. GitHub rejected it with:

```text
Only custom fields can be updated. Fields derived from issues or pull requests
must be updated through their respective APIs.
```

No second Priority field was created. Manual configuration is required.

### Views and workflows

No view or workflow mutation was attempted. The official GraphQL mutation schema
does not expose a safe saved-view create/update mutation, and workflow inspection
exposes only workflow names/enabled state rather than detailed transition/filter
configuration.

## Manual UI actions remaining

The minimal actionable list is maintained in
`github-project-manual-ui-checklist.md`:

1. Populate the retained Priority field with the approved options.
2. Optionally capitalize `In progress` and `In review`.
3. Create the `Blocked` view.
4. Create the `Current Slice` view.
5. Verify the exact Item added, Item closed, Pull request merged, and Auto-add configurations.

Actions completed remotely are intentionally absent from that checklist.

## Failures and uncertainties

- **Failure:** Priority in-place option mutation was rejected as unsupported for the template-provided field; the operation was skipped without blocking unrelated work.
- **Uncertainty:** Built-in workflow transition values and the Auto-add repository filter cannot be read through the available official API fields.
- **Uncertainty:** Saved views cannot be safely created/configured through the available CLI/official GraphQL mutation surface.
- No other remote mutation failed.

## Commands executed

Discovery, mutation, and validation used GitHub CLI and the official GraphQL API
only:

```bash
gh auth status
gh repo view --json nameWithOwner,viewerPermission
gh project view 1 --owner ITI-Sharek --format json
gh project field-list 1 --owner ITI-Sharek --format json
gh project item-list 1 --owner ITI-Sharek --format json --limit 100
gh project field-create 1 --owner ITI-Sharek --name Area --data-type SINGLE_SELECT --single-select-options 'Frontend,Backend,AI,DevOps,Documentation,Cross-cutting' --format json
gh project field-create 1 --owner ITI-Sharek --name Slice --data-type SINGLE_SELECT --single-select-options 'S0 Workflow and CI,S1 Auth and Public Profile,S2 GitHub and AI Skill Inference,S3 Project Publishing,S4 Tasks and AI Fit,S5 Evidence and Reputation' --format json
gh project field-create 1 --owner ITI-Sharek --name Risk --data-type SINGLE_SELECT --single-select-options 'Normal,Security,Data Migration,External API,Architecture' --format json
gh api graphql # inspect/update fields and inspect project link, views, and workflows
gh label create 'type:feature' --repo ITI-Sharek/Sharek --color a2eeef --description 'New user-facing or platform capability'
gh label create 'type:bug' --repo ITI-Sharek/Sharek --color d73a4a --description 'Defect in existing behavior'
gh label create 'type:test' --repo ITI-Sharek/Sharek --color 1d76db --description 'Test coverage or verification work'
gh label create 'type:refactor' --repo ITI-Sharek/Sharek --color 5319e7 --description 'Internal restructuring without intended behavior change'
gh label create 'type:docs' --repo ITI-Sharek/Sharek --color 0075ca --description 'Documentation-only work'
gh label create 'type:chore' --repo ITI-Sharek/Sharek --color cfd3d7 --description 'Repository maintenance or engineering chore'
gh label create 'area:frontend' --repo ITI-Sharek/Sharek --color 0e8a16 --description 'TanStack Start frontend work'
gh label create 'area:backend' --repo ITI-Sharek/Sharek --color 0052cc --description 'NestJS backend work'
gh label create 'area:ai' --repo ITI-Sharek/Sharek --color 8a2be2 --description 'FastAPI or AI integration work'
gh label create 'area:devops' --repo ITI-Sharek/Sharek --color 006b75 --description 'CI, containers, deployment, or operations work'
gh label create 'area:docs' --repo ITI-Sharek/Sharek --color 0075ca --description 'Canonical or supporting documentation work'
gh label create 'area:cross-cutting' --repo ITI-Sharek/Sharek --color e99695 --description 'Work spanning multiple system areas'
gh label create 'risk:security' --repo ITI-Sharek/Sharek --color b60205 --description 'Security or privacy review required'
gh label create 'risk:migration' --repo ITI-Sharek/Sharek --color fbca04 --description 'Data or schema migration risk'
gh label create 'risk:external-api' --repo ITI-Sharek/Sharek --color d876e3 --description 'External API availability or contract risk'
gh label create 'risk:breaking-change' --repo ITI-Sharek/Sharek --color d93f0b --description 'Potentially breaking API, data, or workflow change'
gh label create 'blocked' --repo ITI-Sharek/Sharek --color b60205 --description 'Cannot proceed until a dependency or decision changes'
gh label create 'needs-decision' --repo ITI-Sharek/Sharek --color fbca04 --description 'Requires an explicit product or technical decision'
gh label create 'good-first-task' --repo ITI-Sharek/Sharek --color 7057ff --description 'Small, well-scoped task suitable for a new contributor'
gh label list --repo ITI-Sharek/Sharek --limit 200
git status --short
git diff --stat
git diff --check
```

## Completion assertions

- No feature issues were created.
- No project, field, iteration, view, workflow, label, or item was deleted.
- No duplicate Status, Priority, Size, Area, Slice, or Risk field was created.
- No commit was created.
- No push was performed.
