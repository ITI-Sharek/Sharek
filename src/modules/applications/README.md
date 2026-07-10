# Applications Module

Owns the contributor application workflow.

Applications answers these questions:

- Can this contributor apply to this task?
- Has this contributor already applied?
- What did AI recommend about eligibility?
- Does this application need manual review?
- Did the owner accept or reject the application?

Current state:

- The module is registered but feature workflows are not implemented yet.
- Add folders only when a sprint task creates real files.

Use this module for:

- Applying to contribution tasks.
- Duplicate application prevention.
- Eligibility state.
- AI recommendation snapshots.
- Manual review routing.
- Owner acceptance and rejection.
- Application status history.

Important status transitions belong in domain entities or policies and must be
tested.

## First Workflow To Build

The first likely workflow is `ApplyToTask`.

Suggested structure when implementation starts:

```text
applications/
  applications.module.ts
  domain/
    entities/application.entity.ts
    enums/application-status.enum.ts
    exceptions/application-already-exists.error.ts
    exceptions/invalid-application-transition.error.ts
    policies/application-eligibility.policy.ts
  application/
    use-cases/apply-to-task.use-case.ts
    dto/apply-to-task.input.ts
    dto/application.result.ts
    ports/contribution-task.reader.ts
    ports/approved-skills.reader.ts
    ports/eligibility-analyzer.port.ts
  infrastructure/
    persistence/application.repository.prisma.ts
    persistence/application.persistence-mapper.ts
  presentation/
    http/controllers/applications.controller.ts
    http/requests/apply-to-task.request.ts
    http/responses/application.response.ts
```

Expected flow:

```text
ApplicationsController
  -> ApplyToTaskRequest
  -> ApplyToTaskUseCase
  -> task reader and approved skills reader
  -> EligibilityAnalyzer port
  -> Application entity/policy
  -> application repository
  -> ApplicationResponse
```

## Where To Put New Files

- `presentation/http/controllers`: apply, list my applications, owner decision,
  manual review decision endpoints.
- `presentation/http/requests`: apply request, owner accept/reject request,
  manual review request.
- `presentation/http/responses`: application detail/list response shapes.
- `application/use-cases`: apply to task, route to manual review, owner accept,
  owner reject, contributor cancel.
- `application/ports`: task reader, approved skills reader, AI eligibility
  analyzer, admin review notifier.
- `domain/entities`: application entity and protected status transitions.
- `domain/policies`: duplicate application, capacity, eligibility, owner
  decision, manual review policy.
- `infrastructure/persistence`: Prisma application repository and persistence
  mapper.

## Boundaries

Applications owns application status. AI may recommend `eligible`, `rejected`,
or `manual_review`, but this module decides what status is stored.

Do not create contribution tasks here. Do not approve skills here. Do not update
reputation here.
