# GitHub Project Operations

**Status:** Supporting operational guidance

ShareK delivery work is coordinated in the existing organization Project:

- Owner: `ITI-Sharek`
- Project: `ShareK MVP Execution`
- Project number: `1`
- Repository: `ITI-Sharek/Sharek`

The Project is a coordination surface. Product requirements remain in the
canonical documentation, and implementation evidence remains in repository code,
tests, and audits.

## Workflow fields

`Status` is the main workflow field:

```text
Backlog -> Ready -> In progress -> In review -> Done
                         |             |
                         +-> Blocked <-+
```

Iteration is optional scheduling metadata. It does not replace Status and does
not imply implementation completion.

Use the remaining fields consistently:

- `Priority`: `P0 Critical`, `P1 High`, `P2 Medium`, `P3 Low` after its existing template field is configured manually.
- `Size`: `XS`, `S`, `M`, `L`, `XL`.
- `Area`: `Frontend`, `Backend`, `AI`, `DevOps`, `Documentation`, `Cross-cutting`.
- `Slice`: `S0 Workflow and CI`, `S1 Auth and Public Profile`, `S2 GitHub and AI Skill Inference`, `S3 Project Publishing`, `S4 Tasks and AI Fit`, `S5 Evidence and Reputation`.
- `Risk`: `Normal`, `Security`, `Data Migration`, `External API`, `Architecture`.

Sizing policy:

- `XS`: less than half a day.
- `S`: up to one day.
- `M`: one to two days.
- `L`: normally split before assignment.
- `XL`: always split before assignment.

## Issue and pull-request flow

1. Use the implementation-task form for assignable work and the bug form for defects.
2. Cite the applicable requirement/decision IDs in the issue scope.
3. Select Status, Priority, Size, Area, Slice, and Risk in the Project.
4. Keep dependencies and decisions linked; add `blocked` or `needs-decision` only when true.
5. Open a focused pull request that links the issue and uses the repository template.
6. Move work to `In review` when it is ready for review, and to `Done` only when the issue is complete.
7. Update implementation evidence and supporting audit documentation when current repository behavior changes.

Repository labels classify issue type, affected area, and exceptional risk. Do
not create label copies of Project status, priority, size, slice, or iteration.

## Views and automation

Preserve the Iteration Board template views and workflows. `Prioritized backlog`,
`In review`, and `My items` already cover backlog, review queue, and personal work.
Only `Blocked` and `Current Slice` are still recommended as additional views.

Saved view creation and detailed built-in workflow configuration are verified in
the GitHub UI because the supported CLI/GraphQL surface does not expose safe
create/update operations or full transition/filter configuration. Follow
`../audits/github-project-manual-ui-checklist.md` for the remaining actions.

## CLI inspection

```bash
gh project view 1 --owner ITI-Sharek --format json
gh project field-list 1 --owner ITI-Sharek --format json
gh project item-list 1 --owner ITI-Sharek --format json --limit 100
gh label list --repo ITI-Sharek/Sharek --limit 200
```

Do not delete or recreate the Project, Status, Size, or Iteration fields. Never
create feature issues automatically during governance setup.
