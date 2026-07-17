# GitHub Project Manual UI Checklist

**Project:** `ITI-Sharek` → `ShareK MVP Execution` → project `1`

Only operations that could not be safely completed or verified through the
supported GitHub CLI/GraphQL API are listed here.

## Field cleanup

- [ ] **Populate Priority options.** Navigate to `https://github.com/orgs/ITI-Sharek/projects/1` → top-right `...` → **Settings** → **Fields** → **Priority** → edit options. Expected current value: no options. Desired values: `P0 Critical`, `P1 High`, `P2 Medium`, `P3 Low`. Why manual: the official `updateProjectV2Field` mutation rejected this template-provided field as non-custom; creating another Priority field is prohibited.
- [ ] **Optionally capitalize In progress.** Navigate to the Project → top-right `...` → **Settings** → **Fields** → **Status** → `In progress`. Expected current value: `In progress`. Optional desired value: `In Progress`. Why manual: capitalization is semantically accepted, and the standard CLI has no safe option-edit command for this template field.
- [ ] **Optionally capitalize In review.** Navigate to the Project → top-right `...` → **Settings** → **Fields** → **Status** → `In review`. Expected current value: `In review`. Optional desired value: `In Review`. Why manual: capitalization is semantically accepted, and the standard CLI has no safe option-edit command for this template field.

## Missing views

- [ ] **Create Blocked.** Navigate to the Project → click **+ New view** beside the view tabs → choose **Table** → name it `Blocked` → set filter `status:Blocked` → save. Expected current value: no `Blocked` view. Desired value: a table showing only blocked items. Why manual: the official GraphQL mutation schema exposes no supported saved-view creation mutation.
- [ ] **Create Current Slice.** Navigate to the Project → click **+ New view** → choose **Board** → name it `Current Slice` → set column field to **Status** → set filter `Slice:"S0 Workflow and CI"` → save. Expected current value: no `Current Slice` view. Desired value: a Status board filtered to S0. Why manual: the official GraphQL mutation schema exposes no supported saved-view creation/configuration mutation.

## Built-in workflow verification

- [ ] **Verify Item added to project.** Navigate to the Project → top-right `...` → **Workflows** → **Item added to project**. Expected current value: enabled. Desired action: set `Status` to `Backlog`. Why manual: the API exposes name/enabled state but not the configured field transition.
- [ ] **Verify Item closed.** Navigate to the Project → top-right `...` → **Workflows** → **Item closed**. Expected current value: enabled. Desired action: set `Status` to `Done`. Why manual: the API exposes name/enabled state but not the configured field transition.
- [ ] **Verify Pull request merged.** Navigate to the Project → top-right `...` → **Workflows** → **Pull request merged**. Expected current value: enabled. Desired action: set `Status` to `Done`. Why manual: the API exposes name/enabled state but not the configured field transition.
- [ ] **Verify Auto-add repository filter.** Navigate to the Project → top-right `...` → **Workflows** → **Auto-add to project**. Expected current value: enabled; exact filter unverified. Desired value: auto-add issues and pull requests from `ITI-Sharek/Sharek` only when the team wants this behavior. Why manual: the API exposes name/enabled state but not the repository/filter criteria.
