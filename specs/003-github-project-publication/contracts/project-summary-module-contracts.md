# Internal Contract: Project Summary Readers

**Consumer**: `projects` module  
**Providers**: `contribution-tasks`, `applications`, and `identity` modules  
**Transport**: In-process exported NestJS services with explicit typed DTOs

These read-only contracts correct existing brownfield cross-table reads while
preserving the owner workspace and Admin published-owner aggregate. They do not
create public endpoints or transfer table ownership.

## Boundary Rules

- Projects reads and writes only Projects-owned tables directly.
- Each provider reads only data owned by its module and returns the minimum
  allowlisted summary required by the existing Projects response.
- Inputs come from authenticated server context and Projects-owned query results;
  no public request may supply `ownerId`, `userId`, role, Admin privilege, or raw
  contribution-request IDs as authorization evidence.
- Readers are batched. They return no Prisma object, free-form JSON, private
  module status outside the approved count set, or write capability.
- Projects joins summaries by allowlisted IDs in memory and treats a missing
  summary as zero only when the provider contract explicitly defines it.
- These summary readers do not import Projects back into the provider modules;
  server-supplied Project IDs are grouping locators, not a cross-module write or
  authorization grant.

## ContributionTasks Owner-Workspace Reader

### Operation

`summarizeOwnerWorkspace(input)`

### Trusted Input

| Field | Type | Rule |
|---|---|---|
| `ownerUserId` | UUID | Authenticated persisted Project owner supplied by Projects |
| `projectIds` | UUID[] | IDs returned by Projects' owner-scoped Project query |
| `monthStartedAt` | timestamp | Server-derived inclusive quota boundary |

### Result

```text
{
  projects: Array<{
    projectId: UUID,
    openRequestCount: non-negative integer,
    contributionRequestIds: UUID[]
  }>,
  monthlyCreatedRequestCount: non-negative integer
}
```

The provider verifies its rows belong to `ownerUserId`, counts only the existing
approved open/published request states, and returns request IDs solely as the
bounded server-to-server scope for the Applications reader. It exposes no task
body, reward, contributor, application, or Project row.

## Applications Owner-Workspace Reader

### Operation

`summarizePendingByContributionRequests(input)`

### Trusted Input

| Field | Type | Rule |
|---|---|---|
| `requestScopes` | array of `{ projectId, contributionRequestIds }` | Produced by the ContributionTasks reader, never accepted from HTTP |

### Result

```text
{
  projects: Array<{
    projectId: UUID,
    pendingApplicationCount: non-negative integer
  }>
}
```

Applications reads only Application-owned rows whose
`contribution_request_id` is in the supplied bounded scope. The pending set
preserves the existing owner-workspace semantics (`pending_validation` and
`eligible`) unless a later approved application-state decision changes it. No
application body, contributor identity, AI result, or Prisma row crosses the
boundary.

## Identity Admin Owner-Summary Reader

### Operation

`getAdminOwnerSummaries(input)`

### Trusted Input

| Field | Type | Rule |
|---|---|---|
| `actor` | authenticated-user context | Identity verifies persisted active Admin authorization; no boolean bypass |
| `ownerUserIds` | UUID[] | Distinct IDs from Projects' published-only aggregate query |

### Result

```text
Array<{
  ownerUserId: UUID,
  displayName: string,
  email: string
}>
```

Identity returns only fields already required by the existing Admin aggregate.
Unknown IDs are omitted. Projects must not query the `User` relation as a
fallback and must fail safely if the Identity reader cannot establish the Admin
authorization or return a consistent result.

The separate Identity provider-account lookup used for personal GitHub control
remains defined in `github-module-contract.md`; it does not imply Admin access.

## Contract Tests

- Projects performs no Prisma query against ContributionRequest, Application,
  User, or another module-owned relation for these views.
- ContributionTasks enforces the owner scope and returns stable zero counts for
  in-scope Projects without requests.
- Applications counts only the approved pending states and only within supplied
  server-generated request scopes.
- Identity rejects missing, inactive, non-Admin, and request-supplied Admin
  claims; it returns only the three allowlisted fields.
- Batched results cannot introduce a Project ID outside the requested set.
- Provider failure does not cause Projects to use a direct-table fallback or
  leak a partial Prisma/provider object.
