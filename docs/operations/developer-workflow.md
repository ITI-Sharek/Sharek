# Developer Workflow

**Status:** Supporting operational guidance

This guide explains how a ShareK developer finds their task, starts work,
names branches, opens pull requests, and avoids blocked or unrelated work.

## 1. Sync the repository

Start every task from an up-to-date local checkout:

```bash
git checkout dev
git pull origin dev
pnpm install --frozen-lockfile
```

Use `dev` for day-to-day feature integration. `master` is the protected release
branch and should receive reviewed pull requests only.

## 2. Find your task

Open the GitHub Project:

```text
ShareK MVP Execution
```

Filter by:

```text
assignee:@me
```

or use GitHub Issues:

```text
is:open assignee:@me
```

Read the full issue before coding. Each S1 task includes:

- what to build;
- owner roles;
- workstream;
- acceptance criteria;
- blocked-by relationships;
- expected files or modules;
- required commands;
- demo proof; and
- out-of-scope items.

## 3. Start only unblocked work

Do not implement a task while it is marked `blocked` or while its Project status
is `Backlog`.

The current working rule is:

- `Ready` means implementation may start.
- `Backlog` + `blocked` means read/prepare only; do not implement yet.
- `In progress` means the assignee is actively implementing.
- One developer should own at most one `In progress` implementation issue.

## 4. Branch naming

Create branches from `dev`, not from stale local state.

Use this pattern for issue work:

```text
issue-<issue-number>-<short-kebab-description>
```

Examples:

```bash
git checkout -b issue-6-remove-signup-role
git checkout -b issue-8-secure-refresh-cookies
git checkout -b issue-12-public-profile-page
```

Allowed non-issue branch prefixes:

```text
docs/<short-name>
chore/<short-name>
fix/<short-name>
```

CI validates branch names on pull requests.

## 5. Implement only the issue scope

Use the issue body as the implementation contract.

Do:

- implement only the listed build scope;
- keep tests inside the implementation PR;
- run the required commands listed in the issue;
- record demo proof when requested; and
- update operations or audit docs when the issue requires it.

Do not:

- implement blocked follow-up work;
- include unrelated refactors;
- mix multiple assigned issues in one PR;
- include secrets, tokens, private repository content, or unnecessary personal
  data; or
- move AI authority into FastAPI business decisions.

## 6. Pull request title

Use one of these PR title formats:

```text
S1-01: Remove signup role selection
Issue #6: Remove signup role selection
```

CI validates PR titles on pull requests.

## 7. Pull request body

Use `.github/pull_request_template.md`.

The first section must link the issue:

```md
## Linked issue

Closes #6
```

List every command and result in `Tests run`. If a required command was not
run, explain why.

## 8. Review and merge rules

Normal flow:

```text
developer branch -> PR into dev -> review -> merge to dev
```

Release flow:

```text
dev -> PR into master -> @KariMuhammad review -> merge to master
```

`@KariMuhammad` is listed as repository CODEOWNER in `.github/CODEOWNERS`.
GitHub can enforce this automatically only when branch protection or repository
rulesets are available for the repository plan. Until then, it is a documented
team rule and must be checked manually.

No one should merge to `master` without `@KariMuhammad` approval.

## 9. Current S1 starting point

Only issue `#6` is ready to start. Other S1 issues are assigned for visibility
but remain blocked until their dependencies close.

Recommended first command sequence for issue `#6`:

```bash
git checkout dev
git pull origin dev
pnpm install --frozen-lockfile
git checkout -b issue-6-remove-signup-role
```
