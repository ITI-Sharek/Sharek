# GitHub Project Field Conflict Resolution

**Observed:** 2026-07-17

**Project:** `ITI-Sharek` / `ShareK MVP Execution` / number `1`

This record captures the human decisions that allowed setup to continue after
the read-only audit in `github-project-setup-before.md`.

## Resolved decisions

- The existing `Status` field and its current capitalization are accepted.
- The existing empty `Priority` field must be retained and populated if the supported API permits it; it must never be duplicated.
- The existing `Size` field and its `XL` option are accepted.
- The existing `Iteration` field, iterations, views, and enabled workflows are preserved.
- Existing views already cover backlog, personal work, and review queue; only `Blocked` and `Current Slice` remain preferred additions.
- Unsupported operations do not block unrelated safe mutations.

## Mutation outcome

The official GraphQL schema exposes `updateProjectV2Field` and accepts
`singleSelectOptions`. An in-place update of the existing Priority field
`PVTSSF_lADOEdQVm84BdrPgzhYLH5o` was attempted with the approved options. GitHub
returned:

```text
Only custom fields can be updated. Fields derived from issues or pull requests
must be updated through their respective APIs.
```

The field is template-provided and cannot be safely updated through that
supported mutation. No second Priority field was created. Its options remain a
manual UI action.

These custom fields were created and verified exactly once:

| Field | Field ID | Options |
|---|---|---|
| Area | `PVTSSF_lADOEdQVm84BdrPgzhYLYDk` | Frontend; Backend; AI; DevOps; Documentation; Cross-cutting |
| Slice | `PVTSSF_lADOEdQVm84BdrPgzhYLYKc` | S0 Workflow and CI; S1 Auth and Public Profile; S2 GitHub and AI Skill Inference; S3 Project Publishing; S4 Tasks and AI Fit; S5 Evidence and Reputation |
| Risk | `PVTSSF_lADOEdQVm84BdrPgzhYLYQU` | Normal; Security; Data Migration; External API; Architecture |

Status, Size, Iteration, Estimate, all existing views/workflows, the repository
link, and all project items were left unchanged. No view or workflow mutation
was attempted because the official mutation schema exposes no supported saved-view
create/update operation or detailed workflow configuration mutation.
