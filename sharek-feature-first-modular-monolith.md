# Share-k Feature-First Modular Monolith Architecture

> A detailed, beginner-friendly guide for organizing the Share-k NestJS backend as a feature-first modular monolith with lightweight Clean Architecture.

For day-to-day work in the current backend repo, use
`docs/developer-architecture-guide.md` after reading this document. That guide
shows the current files, practical folder rules, and examples from implemented
modules. The folder trees below are target shapes, not a command to create empty
folders.

## 1. Final architecture decision

The recommended backend architecture for Share-k is:

> **Feature-first Modular Monolith with lightweight Clean Architecture inside each business module.**

This means:

- Share-k has one main NestJS backend application.
- The backend is divided by business feature, not only by technical type.
- Each feature is a module with a clear responsibility and boundary.
- Important modules can contain `domain`, `application`, `infrastructure`, and `presentation` layers.
- Simple modules do not need empty layers or unnecessary abstractions.
- PostgreSQL is the main source of truth.
- AI-heavy work can run in a separate FastAPI service, while NestJS remains the owner of business state.

The starting structure is:

```text
src/
├── modules/
│   ├── identity/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   ├── github/
│   ├── skill-profiles/
│   ├── projects/
│   ├── contribution-tasks/
│   ├── applications/
│   ├── delivery-reviews/
│   ├── reputation/
│   └── admin/
│
├── shared/
│   ├── database/
│   ├── events/
│   ├── auth/
│   ├── errors/
│   └── observability/
│
├── app.module.ts
└── main.ts
```

## 2. What the architecture name means

### 2.1 Feature-first

The first division in the source code is by business capability:

```text
identity/
projects/
applications/
reputation/
```

It is not divided globally like this:

```text
controllers/
services/
repositories/
entities/
```

With a global technical-layer structure, one feature is spread across the entire project. To understand applications, a developer has to search in several unrelated top-level folders.

With feature-first organization, almost everything about an application is located inside:

```text
modules/applications/
```

This improves:

- Navigation.
- Ownership between team members.
- Testing.
- Refactoring.
- Module extraction in the future.
- Protection against accidental coupling.

### 2.2 Modular Monolith

The system is deployed as one NestJS backend, but internally it behaves like a collection of well-separated modules.

```text
                    NestJS application
┌──────────────────────────────────────────────────────┐
│ Identity │ Projects │ Applications │ Reputation      │
│ GitHub   │ Skills   │ Tasks        │ Admin           │
└──────────────────────────────────────────────────────┘
                         |
                         v
                    PostgreSQL
```

The modules use normal in-process calls, so Share-k avoids the network and operational complexity of full microservices.

A modular monolith is not permission for every module to access every class or table. The module boundaries must be enforced through code conventions, tests, and limited public APIs.

### 2.3 Lightweight Clean Architecture

Clean Architecture separates business rules from frameworks and external tools.

The basic direction is:

```text
Presentation  →  Application  →  Domain
                       ↑
               Infrastructure
```

More precisely:

- `presentation` calls the application layer.
- `application` coordinates use cases and calls contracts.
- `domain` contains business concepts and rules.
- `infrastructure` implements contracts using PostgreSQL, GitHub, FastAPI, email, or other external systems.
- The domain must not import NestJS controllers, an ORM, HTTP clients, or vendor SDKs.

“Lightweight” means that Share-k adds abstractions only when they protect real business rules or external boundaries. We do not create interfaces and factories simply to make the folder tree look complete.

## 3. System-level view

```text
Next.js frontend
        |
        | HTTPS / REST
        v
NestJS modular monolith
        |
        ├── PostgreSQL + pgvector
        ├── Redis / job queue (when asynchronous jobs are needed)
        ├── GitHub API
        └── FastAPI AI service
                  |
                  ├── skill profiling
                  ├── eligibility analysis
                  ├── embeddings
                  └── LLM providers
```

### Ownership rule

NestJS owns:

- Users and permissions.
- GitHub account connections.
- Published projects.
- Contribution tasks.
- Applications and their status.
- Approved skill profiles.
- Reviews and reputation.
- Admin decisions.

The AI service owns computation, not Share-k business state. It returns a structured recommendation to NestJS. NestJS validates that recommendation and decides what is stored.

For example, FastAPI may return:

```json
{
  "decision": "manual_review",
  "confidence": 0.68,
  "matchedSkills": ["NestJS", "PostgreSQL"],
  "missingSkills": ["Docker"],
  "evidenceIds": ["evidence-123", "evidence-456"],
  "reason": "The contributor has backend evidence, but Docker evidence is weak."
}
```

FastAPI must not directly update `applications.status`.

## 4. The four layers inside a module

Not every module must start with all four layers. The following structure is most valuable for modules with important business rules, such as applications, skill profiles, delivery reviews, and reputation.

```text
module-name/
├── domain/
├── application/
├── infrastructure/
├── presentation/
└── module-name.module.ts
```

### 4.1 Domain layer

The domain layer describes the business itself without knowing how the web server or database works.

It can contain:

```text
domain/
├── entities/
├── value-objects/
├── enums/
├── events/
├── exceptions/
├── policies/
└── contracts/
```

#### Entities

An entity has an identity and lifecycle.

Examples:

- `User`
- `Project`
- `ContributionTask`
- `Application`
- `SkillProfile`

An `Application` entity can enforce status transitions:

```typescript
export enum ApplicationStatus {
  PendingValidation = 'pending_validation',
  Eligible = 'eligible',
  ManualReview = 'manual_review',
  Rejected = 'rejected',
  Accepted = 'accepted',
}

export class Application {
  constructor(
    readonly id: string,
    readonly contributorId: string,
    readonly taskId: string,
    private status: ApplicationStatus,
  ) {}

  markEligible(): void {
    if (this.status !== ApplicationStatus.PendingValidation) {
      throw new InvalidApplicationTransitionError();
    }

    this.status = ApplicationStatus.Eligible;
  }
}
```

The rule belongs to the entity because it must remain true whether the application is changed by HTTP, a background worker, a CLI command, or a test.

#### Value objects

A value object represents a meaningful value without its own database identity.

Possible examples:

- `GitHubRepositoryUrl`
- `SkillConfidence`
- `ReputationScore`
- `EmailAddress`

Use a value object only when it validates or protects a real rule. A plain project title does not automatically need a `ProjectTitle` class.

#### Domain events

A domain event records something important that happened:

```text
ApplicationSubmitted
ApplicationAccepted
DeliveryApproved
SkillProfileApproved
```

Events reduce direct coupling. For example, after `DeliveryApproved`, the reputation module can calculate a reputation update without making the delivery module own reputation logic.

#### Domain contracts

A contract is an interface required by the domain or application logic:

```typescript
export abstract class ApplicationRepository {
  abstract findById(id: string): Promise<Application | null>;
  abstract existsForContributorAndTask(
    contributorId: string,
    taskId: string,
  ): Promise<boolean>;
  abstract save(application: Application): Promise<void>;
}
```

The contract describes what the business needs. It does not describe Prisma, TypeORM, SQL, or PostgreSQL details.

### 4.2 Application layer

The application layer contains the actions that users or other parts of the system can perform.

```text
application/
├── use-cases/
├── dto/
├── ports/
└── mappers/
```

Examples of use cases:

```text
RegisterUser
ConnectGitHubAccount
PublishProject
CreateContributionTask
ApplyToTask
ValidateApplication
ApproveSkillProfile
ApproveDelivery
```

A use case:

1. Receives a command or input DTO.
2. Loads required entities through contracts.
3. Checks authorization and business rules.
4. Changes domain state.
5. Saves through repository contracts.
6. Returns a result DTO.

Example:

```typescript
@Injectable()
export class ApplyToTaskUseCase {
  constructor(
    private readonly applications: ApplicationRepository,
    private readonly tasks: ContributionTaskReader,
    private readonly approvedSkills: ApprovedSkillsReader,
  ) {}

  async execute(input: ApplyToTaskInput): Promise<ApplicationResult> {
    const task = await this.tasks.findAvailableTask(input.taskId);

    if (!task) {
      throw new TaskNotAvailableError(input.taskId);
    }

    const duplicate = await this.applications.existsForContributorAndTask(
      input.contributorId,
      input.taskId,
    );

    if (duplicate) {
      throw new ApplicationAlreadyExistsError();
    }

    const skills = await this.approvedSkills.getForContributor(
      input.contributorId,
    );

    const application = Application.submit({
      contributorId: input.contributorId,
      taskId: input.taskId,
      approvedSkillIds: skills.map((skill) => skill.id),
    });

    await this.applications.save(application);

    return ApplicationResult.fromDomain(application);
  }
}
```

The use case does not know:

- Which HTTP route called it.
- Which ORM is used.
- Which database table stores the application.
- Whether skill validation uses FastAPI or another provider.

#### Application ports

A port represents an external capability needed by a use case:

```typescript
export abstract class SkillEligibilityAnalyzer {
  abstract analyze(
    input: EligibilityInput,
  ): Promise<EligibilityRecommendation>;
}
```

Infrastructure provides the real adapter:

```text
SkillEligibilityAnalyzer
            ↑
FastApiSkillEligibilityAdapter
```

### 4.3 Infrastructure layer

Infrastructure contains technical implementations and vendor-specific code:

```text
infrastructure/
├── persistence/
│   ├── orm/
│   ├── repositories/
│   └── mappers/
├── integrations/
├── jobs/
└── configuration/
```

Examples:

- PostgreSQL repository implementations.
- Prisma or TypeORM models.
- GitHub API clients.
- FastAPI HTTP adapters.
- Queue producers and consumers.
- Object storage adapters.

Example:

```typescript
@Injectable()
export class PostgresApplicationRepository
  implements ApplicationRepository
{
  constructor(private readonly database: DatabaseService) {}

  async findById(id: string): Promise<Application | null> {
    const row = await this.database.application.findUnique({
      where: { id },
    });

    return row ? ApplicationPersistenceMapper.toDomain(row) : null;
  }

  async save(application: Application): Promise<void> {
    const row = ApplicationPersistenceMapper.toPersistence(application);

    await this.database.application.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    });
  }
}
```

ORM rows and domain entities are related but not necessarily the same class. Keeping a mapper is useful when the domain has meaningful behavior. For simple CRUD data, using a separate domain entity may not provide enough value.

### 4.4 Presentation layer

Presentation is how the outside world communicates with the application.

For the REST API:

```text
presentation/
└── http/
    ├── controllers/
    ├── requests/
    ├── responses/
    ├── guards/
    └── presenters/
```

A controller should:

- Define the route.
- Parse and validate the request.
- Read authenticated-user information.
- Call one application use case.
- Convert the result into an HTTP response.

A controller should not:

- Query the ORM directly.
- contain eligibility rules.
- calculate reputation.
- call GitHub or the AI service directly.
- control a long business workflow.

Example:

```typescript
@Controller('tasks/:taskId/applications')
export class ApplicationsController {
  constructor(private readonly applyToTask: ApplyToTaskUseCase) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
    @Body() request: ApplyToTaskRequest,
  ): Promise<ApplicationResponse> {
    const result = await this.applyToTask.execute({
      contributorId: user.id,
      taskId,
      message: request.message,
    });

    return ApplicationResponse.fromResult(result);
  }
}
```

## 5. Detailed Share-k modules

## 5.1 Identity module

### Responsibility

Identity owns authentication, users, roles, and account access.

### It owns

- User accounts.
- Login/session or token handling.
- Roles such as contributor, owner, and admin.
- Account status.
- Permission checks at the identity level.

### Suggested tables

```text
users
user_roles
refresh_tokens or sessions
```

### Example use cases

```text
RegisterUser
LoginUser
RefreshSession
AssignUserRole
DisableUser
GetCurrentUser
```

### Public module API

Other modules may request:

```text
getUserById(userId)
assertUserIsActive(userId)
hasRole(userId, role)
```

Other modules must not query the `users` table directly.

### Suggested structure

```text
identity/
├── domain/
│   ├── entities/user.entity.ts
│   ├── enums/user-role.enum.ts
│   ├── exceptions/
│   └── contracts/user.repository.ts
├── application/
│   ├── use-cases/register-user.use-case.ts
│   ├── use-cases/login-user.use-case.ts
│   └── dto/
├── infrastructure/
│   ├── persistence/postgres-user.repository.ts
│   └── security/password-hasher.adapter.ts
├── presentation/
│   └── http/
│       ├── auth.controller.ts
│       └── users.controller.ts
└── identity.module.ts
```

## 5.2 GitHub module

### Responsibility

The GitHub module owns the integration between Share-k and GitHub.

### It owns

- GitHub OAuth connection metadata.
- Encrypted GitHub tokens or token references.
- Repository metadata ingestion.
- Rate-limit handling.
- Normalizing GitHub responses into Share-k-friendly data.

### Suggested tables

```text
github_accounts
github_installations
github_repositories
github_ingestion_jobs
github_evidence
```

### Example use cases

```text
ConnectGitHubAccount
DisconnectGitHubAccount
ImportRepository
RefreshRepositoryMetadata
CollectContributorEvidence
```

### Boundary rule

The projects module should not call the GitHub SDK directly. It requests normalized repository data from the GitHub module.

```text
Projects module
      |
      v
GitHubRepositoryReader port
      |
      v
GitHub module
      |
      v
GitHub API
```

## 5.3 Skill Profiles module

### Responsibility

This module owns claimed or generated skills, supporting evidence, confidence, and approval state.

### It owns

- Contributor skill profiles.
- Evidence linked to skills.
- AI-generated skill candidates.
- Pending, approved, rejected, and manually adjusted states.
- The rule that unapproved skills cannot affect eligibility.

### Suggested tables

```text
skill_profiles
skills
skill_evidence
skill_profile_reviews
```

### Example use cases

```text
GenerateSkillProfile
StoreGeneratedSkills
GetApprovedSkills
SubmitSkillProfileForReview
ApproveSkill
RejectSkill
AdjustSkillLevel
```

### Important invariant

```text
Only approved skill evidence can be used for application eligibility.
```

AI can propose skills, but it cannot approve them. Approval is a Share-k business decision owned by NestJS.

## 5.4 Projects module

### Responsibility

The projects module owns project drafts, publishing, visibility, and discovery metadata.

### It owns

- Project owner.
- Project title and description.
- GitHub repository reference.
- Technology tags.
- Draft/published/archived status.
- Discovery filters.

### Suggested tables

```text
projects
project_technologies
project_tags
```

### Example use cases

```text
CreateProjectFromRepository
UpdateProjectDraft
PublishProject
ArchiveProject
GetPublishedProject
SearchPublishedProjects
```

### Important invariants

- A project cannot be publicly discovered until its owner publishes it.
- Only the owner or an authorized admin can edit or archive it.
- The project stores normalized GitHub information; it does not own GitHub tokens.

## 5.5 Contribution Tasks module

### Responsibility

This module owns contribution opportunities created under published projects.

### It owns

- Task title and description.
- Required skills.
- Difficulty.
- Task status.
- Capacity or number of available contributors.
- Application deadline if used.

### Suggested tables

```text
contribution_tasks
task_required_skills
```

### Example use cases

```text
CreateContributionTask
UpdateContributionTask
OpenContributionTask
CloseContributionTask
GetAvailableTask
ListProjectTasks
```

### Important invariants

- Only a project owner can create tasks for that project.
- Applications can only target an open task.
- Required skill changes must not silently alter an application that has already been decided.

## 5.6 Applications module

### Responsibility

This module owns the complete process of a contributor applying to a task.

### It owns

- The application.
- Eligibility status.
- AI recommendation snapshot.
- Owner acceptance or rejection.
- Manual-review state.
- Application status transitions.

### Suggested tables

```text
applications
application_eligibility_results
application_status_history
```

### Example use cases

```text
ApplyToTask
StartEligibilityValidation
RecordEligibilityResult
SendToManualReview
AcceptApplication
RejectApplication
WithdrawApplication
```

### Recommended status model

```text
pending_validation
        |
        ├── eligible ────────> pending_owner_review
        │                           |
        │                           ├── accepted
        │                           └── rejected
        |
        ├── manual_review ───> eligible or rejected
        |
        └── rejected
```

The exact statuses can be simplified, but transitions must be explicit and tested.

### Suggested detailed structure

```text
applications/
├── domain/
│   ├── entities/
│   │   └── application.entity.ts
│   ├── enums/
│   │   └── application-status.enum.ts
│   ├── events/
│   │   ├── application-submitted.event.ts
│   │   └── application-accepted.event.ts
│   ├── exceptions/
│   │   ├── application-already-exists.error.ts
│   │   └── invalid-application-transition.error.ts
│   └── contracts/
│       └── application.repository.ts
├── application/
│   ├── use-cases/
│   │   ├── apply-to-task.use-case.ts
│   │   ├── validate-application.use-case.ts
│   │   ├── accept-application.use-case.ts
│   │   └── reject-application.use-case.ts
│   ├── dto/
│   └── ports/
│       ├── contribution-task.reader.ts
│       ├── approved-skills.reader.ts
│       └── skill-eligibility-analyzer.ts
├── infrastructure/
│   ├── persistence/
│   │   ├── application.persistence-mapper.ts
│   │   └── postgres-application.repository.ts
│   └── integrations/
│       └── fastapi-skill-eligibility.adapter.ts
├── presentation/
│   └── http/
│       ├── applications.controller.ts
│       ├── requests/
│       └── responses/
└── applications.module.ts
```

## 5.7 Delivery Reviews module

### Responsibility

This module owns the work-delivery and owner-review process after an application is accepted.

### It owns

- Delivery submission.
- Pull request link.
- Delivery status.
- Owner approval or rejection.
- Rating and written feedback.

### Suggested tables

```text
deliveries
delivery_reviews
```

### Example use cases

```text
SubmitDelivery
UpdateDelivery
ApproveDelivery
RejectDelivery
RequestDeliveryChanges
```

### Important invariants

- Only the contributor assigned through an accepted application can submit a delivery.
- Only the project owner can approve or reject it.
- A reputation update must be based on an approved, verified delivery.

## 5.8 Reputation module

### Responsibility

The reputation module owns the calculation and history of trusted contributor reputation.

### It owns

- Current reputation score.
- Score history.
- Calculation rules.
- Public reputation summary.
- Verified completion counts.

### Suggested tables

```text
reputation_profiles
reputation_events
```

### Example use cases

```text
RecordApprovedDelivery
RecalculateReputation
GetContributorReputation
GetReputationHistory
```

### Preferred interaction

```text
DeliveryReviews module
        |
        | publishes DeliveryApproved
        v
Reputation event handler
        |
        v
Reputation module updates its own data
```

The delivery module should not calculate or write the reputation score.

## 5.9 Admin module

### Responsibility

The admin module provides administrative workflows across Share-k.

### It owns

- Admin-facing queues and workflow state.
- Manual eligibility review.
- Reports and disputes.
- Moderation actions.
- Audit views.

It does not own the underlying business entities from other modules.

For example, an admin controller may invoke the skill-profiles module’s `ApproveSkill` use case. It must not update the `skills` table directly.

### Suggested tables

```text
admin_review_queue
reports
disputes
moderation_actions
```

### Example use cases

```text
ListPendingSkillReviews
ReviewPendingSkill
ListManualEligibilityReviews
ResolveManualEligibilityReview
ResolveReport
SuspendAccount
```

## 6. The shared folder

`shared/` contains technical capabilities that are truly used throughout the backend.

It is not a business module and must not become a dumping ground.

```text
shared/
├── database/
├── events/
├── auth/
├── errors/
└── observability/
```

### 6.1 `shared/database`

Contains database setup used by modules:

```text
database/
├── database.module.ts
├── database.service.ts
├── transaction-manager.ts
└── migrations/
```

It can expose a database connection or transaction manager. Module-specific repositories remain inside their modules.

Do not place these here:

```text
application.repository.ts
project.repository.ts
skill.repository.ts
```

### 6.2 `shared/events`

Contains the event transport mechanism:

```text
events/
├── event-bus.ts
├── event-handler.ts
├── integration-event.ts
└── outbox/
```

Business event definitions should normally remain in the module that produces them:

```text
applications/domain/events/application-accepted.event.ts
```

### 6.3 `shared/auth`

Contains reusable HTTP authentication and authorization plumbing:

```text
auth/
├── current-user.decorator.ts
├── authenticated-user.ts
├── jwt-auth.guard.ts
├── roles.decorator.ts
└── roles.guard.ts
```

Identity owns login and user accounts. `shared/auth` only supplies reusable request-level mechanisms.

### 6.4 `shared/errors`

Contains general error handling:

```text
errors/
├── application-error.ts
├── not-found.error.ts
├── conflict.error.ts
└── http-exception.filter.ts
```

Business-specific errors remain in their modules:

```text
applications/domain/exceptions/
projects/domain/exceptions/
```

### 6.5 `shared/observability`

Contains:

- Structured logging.
- Request correlation IDs.
- Tracing.
- Metrics.
- Error-monitoring adapters.

```text
observability/
├── logger.ts
├── correlation-id.middleware.ts
├── tracing.ts
└── metrics.ts
```

Observability must not contain business decisions.

## 7. Module communication rules

These rules are more important than the folder names.

### Rule 1: A module owns its tables

Only the applications module writes application tables.

```text
applications module  ──writes──> applications
reputation module    ──writes──> reputation_events
projects module      ──writes──> projects
```

A shared PostgreSQL database is acceptable. Logical ownership is enforced in code even if physical tables live in the same database.

### Rule 2: Never import another module’s infrastructure

Avoid:

```typescript
import { PostgresSkillRepository }
  from '../skill-profiles/infrastructure/persistence/...';
```

That bypasses the module boundary.

Use a public application service, reader port, or event instead.

### Rule 3: Use direct calls for immediate answers

Use an in-process call when the caller needs an answer immediately:

```text
Applications → ContributionTasks: Is this task open?
Applications → SkillProfiles: What are the approved skills?
```

Expose a narrow read API rather than the entire internal service:

```typescript
export abstract class ApprovedSkillsReader {
  abstract getForContributor(
    contributorId: string,
  ): Promise<ReadonlyArray<ApprovedSkill>>;
}
```

### Rule 4: Use events for reactions

Use events when another module reacts after something has happened:

```text
DeliveryApproved
    ├──> Reputation updates the score
    └──> Notifications sends a message
```

The producer should not know every consumer.

### Rule 5: Avoid circular dependencies

This is dangerous:

```text
Applications → Tasks → Applications
```

If two modules need each other:

1. Recheck their responsibilities.
2. Replace one direction with an event.
3. Extract a small read contract.
4. Do not use NestJS `forwardRef()` as the normal solution.

## 8. Main business workflows

## 8.1 GitHub onboarding and skill profiling

```text
1. User connects GitHub account.
2. Identity confirms the authenticated user.
3. GitHub module stores connection metadata securely.
4. GitHub module starts an ingestion job.
5. GitHub module collects and normalizes evidence.
6. Skill Profiles requests AI analysis.
7. FastAPI returns proposed skills with evidence and confidence.
8. Skill Profiles stores them as pending.
9. Admin reviews the proposed skills.
10. Skill Profiles marks approved skills as eligible for later use.
```

Ownership stays clear:

- GitHub owns ingestion.
- AI computes proposals.
- Skill Profiles owns skill state.
- Admin performs the review workflow.

## 8.2 Project publication

```text
1. Owner submits a GitHub repository URL.
2. Projects checks the authenticated owner.
3. GitHub returns normalized repository metadata.
4. Projects creates a draft.
5. Owner reviews and edits allowed metadata.
6. Owner publishes the project.
7. The published project becomes discoverable.
```

The project module stores a repository reference, but it does not store or expose GitHub access tokens.

## 8.3 Applying to a task

```text
POST /tasks/:taskId/applications
                |
                v
ApplicationsController
                |
                v
ApplyToTaskUseCase
        ┌───────┴────────┐
        v                v
Check task         Check duplicate
availability       application
        |                |
        └───────┬────────┘
                v
Create pending application
                |
                v
Eligibility validation
        ┌───────┼──────────────┐
        v       v              v
    eligible  rejected    manual_review
```

Recommended eligibility order:

1. Deterministic rules first.
2. Approved-skill and semantic evidence second.
3. LLM explanation third.
4. `manual_review` whenever confidence or evidence is insufficient.

Do not force uncertain AI output into a false yes/no answer.

## 8.4 Delivery and reputation

```text
Accepted application
        |
        v
Contributor submits PR
        |
        v
Owner reviews delivery
        |
        v
DeliveryApproved event
        |
        v
Reputation module records verified completion
```

This flow gives reputation a trustworthy source: completed and approved work.

## 9. Transactions and reliable events

### Inside one module

Use a database transaction when several writes must succeed or fail together.

Example:

```text
Create application
+ append status history
+ save event to outbox
= one transaction
```

### Across modules

Do not create a large transaction that allows many modules to modify each other’s tables.

For reliable asynchronous reactions, use the outbox pattern:

```text
1. Save business data.
2. Save an outbox event in the same transaction.
3. A worker publishes the event.
4. Consumers handle the event idempotently.
5. Successfully published events are marked complete.
```

For the first MVP, simple in-process events may be enough. Add a durable outbox when losing an event would create incorrect business state.

## 10. Database design

Share-k can start with one PostgreSQL database.

```text
PostgreSQL
├── identity-owned tables
├── github-owned tables
├── skill-profile-owned tables
├── project-owned tables
├── contribution-task-owned tables
├── application-owned tables
├── delivery-owned tables
└── reputation-owned tables
```

### Recommended rules

- Every table has one owning module.
- Only the owner writes that table.
- Cross-module reads go through a module API where practical.
- Foreign keys are allowed in the monolith, but they do not give permission to bypass module logic.
- Store AI inputs, evidence IDs, model/version metadata, confidence, and final decisions for auditability.
- Use migrations for every schema change.
- Use `pgvector` when vector search is genuinely required; PostgreSQL remains the source of truth.

## 11. NestJS module wiring

Each module has a composition file that connects contracts to implementations.

```typescript
@Module({
  imports: [DatabaseModule, HttpModule],
  controllers: [ApplicationsController],
  providers: [
    ApplyToTaskUseCase,
    ValidateApplicationUseCase,
    {
      provide: ApplicationRepository,
      useClass: PostgresApplicationRepository,
    },
    {
      provide: SkillEligibilityAnalyzer,
      useClass: FastApiSkillEligibilityAdapter,
    },
  ],
  exports: [ApplicationsReader],
})
export class ApplicationsModule {}
```

The root application imports business modules:

```typescript
@Module({
  imports: [
    IdentityModule,
    GitHubModule,
    SkillProfilesModule,
    ProjectsModule,
    ContributionTasksModule,
    ApplicationsModule,
    DeliveryReviewsModule,
    ReputationModule,
    AdminModule,
  ],
})
export class AppModule {}
```

Only export the narrow services or tokens that other modules really need. Internal repositories and use cases should remain private by default.

## 12. Authentication and authorization

Authentication answers:

> Who is making the request?

Authorization answers:

> Is this user allowed to perform this business action?

Use guards for broad route access:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Owner)
@Post('projects/:projectId/tasks')
createTask() {}
```

But ownership rules must still be checked in the application or domain layer:

```text
The user has the Owner role
             does not automatically mean
The user owns this specific project
```

The use case must verify that relationship.

## 13. Error handling

Use meaningful application or domain errors:

```text
ProjectNotFoundError
TaskNotAvailableError
ApplicationAlreadyExistsError
UnapprovedSkillsError
InvalidApplicationTransitionError
```

A global HTTP exception filter can translate them:

```text
ProjectNotFoundError            → 404
ApplicationAlreadyExistsError   → 409
TaskNotAvailableError           → 422
Unauthorized ownership          → 403
Invalid request DTO             → 400
```

The domain should not throw NestJS `HttpException`, because HTTP is a presentation concern.

## 14. Testing strategy

### Domain unit tests

Test business rules without NestJS or a database:

```text
Application can move from pending_validation to eligible.
Application cannot be accepted before eligibility.
Approved delivery changes to completed only once.
Reputation score stays inside its valid range.
```

### Use-case tests

Use fake contracts:

```text
ApplyToTask rejects duplicate applications.
ApplyToTask rejects a closed task.
ApproveSkill requires admin authorization.
PublishProject requires project ownership.
```

### Infrastructure integration tests

Test real technical boundaries:

```text
PostgresApplicationRepository saves and reloads an entity.
GitHub adapter normalizes API responses.
FastAPI adapter handles timeout and malformed output.
```

### Module integration tests

Test one complete module through its public interface.

### End-to-end tests

Test only the most important product flows:

```text
Register → connect GitHub → generate skills → admin approval.
Publish project → create task → contributor applies.
Validate application → owner accepts → contributor delivers.
Owner approves delivery → reputation is updated.
```

## 15. Scaling strategy

Scalability has more than one meaning.

### Codebase scalability

The module boundaries let the team add features without turning the application into one connected ball of code.

### Runtime scalability

The NestJS application can be replicated horizontally:

```text
Load balancer
    ├── NestJS instance 1
    ├── NestJS instance 2
    └── NestJS instance 3
```

Keep API instances stateless. Store durable state in PostgreSQL and shared temporary state in Redis when necessary.

### Workload scalability

Slow operations should move to workers:

- GitHub ingestion.
- Embedding generation.
- Skill profiling.
- Large AI validations.
- Email and notifications.

```text
NestJS API → queue → worker → GitHub/FastAPI/provider
```

### Database scalability

Start with:

- Correct indexes.
- Query monitoring.
- Pagination.
- Connection pooling.
- Caching only where measurements justify it.

Do not split databases or introduce microservices before load data shows a real bottleneck.

## 16. When to extract a microservice

A module may later become a service when there is evidence such as:

- It needs independent scaling.
- It has a very different runtime or dependency environment.
- It needs independent deployments for a real team reason.
- Its failures must be isolated from the main backend.
- Its boundary has already remained stable inside the modular monolith.

That is why AI is a reasonable early external service: Python AI dependencies and workload scaling differ from the NestJS business backend.

Do not extract a module merely because:

- Microservices sound more scalable.
- The folder is large.
- Another company uses them.
- The team wants one service per database table.

## 17. What not to do

### Do not create a global repository folder

Avoid:

```text
src/repositories/
├── application.repository.ts
├── project.repository.ts
└── skill.repository.ts
```

Keep each repository contract and implementation close to its module.

### Do not place business logic in controllers

Avoid:

```typescript
@Post()
async apply() {
  // query five tables
  // calculate skills
  // decide eligibility
  // call AI
  // write application status
}
```

The controller should delegate to a use case.

### Do not use `shared/` for convenience

If only applications use a helper, it belongs to applications.

### Do not allow AI to be the final authority

Rules, approved evidence, confidence thresholds, manual review, and audit history belong to the business backend.

### Do not create empty architecture ceremony

This is unnecessary:

```text
simple-module/
├── domain/
│   ├── entities/
│   ├── events/
│   ├── policies/
│   └── services/
```

if every directory is empty and the module only reads a simple lookup table.

## 18. Practical implementation order

Build the architecture gradually.

### Phase 1: Foundation

```text
shared/database
shared/errors
shared/auth
identity
github
```

### Phase 2: First trust loop

```text
skill-profiles
projects
contribution-tasks
applications
admin review
```

This proves the core Share-k flow:

```text
GitHub evidence
  → reviewed skill profile
  → published project and task
  → eligibility validation
  → owner review
```

### Phase 3: Verified outcomes

```text
delivery-reviews
reputation
```

### Phase 4: Operational hardening

```text
queues
outbox
observability
rate limiting
performance indexes
retry and timeout policies
```

Add premium plans, advanced matching, or extra services only when the MVP core is reliable.

## 19. Recommended final source tree

```text
src/
├── modules/
│   ├── identity/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── presentation/
│   │   └── identity.module.ts
│   │
│   ├── github/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── presentation/
│   │   └── github.module.ts
│   │
│   ├── skill-profiles/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── presentation/
│   │   └── skill-profiles.module.ts
│   │
│   ├── projects/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── presentation/
│   │   └── projects.module.ts
│   │
│   ├── contribution-tasks/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── presentation/
│   │   └── contribution-tasks.module.ts
│   │
│   ├── applications/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── presentation/
│   │   └── applications.module.ts
│   │
│   ├── delivery-reviews/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── presentation/
│   │   └── delivery-reviews.module.ts
│   │
│   ├── reputation/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── reputation.module.ts
│   │
│   └── admin/
│       ├── application/
│       ├── presentation/
│       └── admin.module.ts
│
├── shared/
│   ├── database/
│   ├── events/
│   ├── auth/
│   ├── errors/
│   └── observability/
│
├── app.module.ts
└── main.ts
```

Notice that GitHub and Admin start with fewer layers. This is intentional. Add more structure only when their business complexity grows.

## 20. Architecture checklist

Before merging a feature, ask:

- Is this code inside the module that owns the business capability?
- Is the controller thin?
- Is the business rule in the use case or domain?
- Does the domain avoid ORM, HTTP, and NestJS dependencies?
- Is external access hidden behind a port or contract?
- Is another module’s infrastructure being imported?
- Is another module’s table being written directly?
- Does this operation need a transaction?
- Could an event handler run twice safely?
- Is AI output validated before changing business state?
- Does an uncertain decision support manual review?
- Are important status transitions tested?
- Is something being placed in `shared/` merely for convenience?

If the module boundaries and these rules are respected, Share-k remains maintainable even while it is deployed as one application.
