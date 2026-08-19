# Class Diagrams

These diagrams show the runtime classes of the NestJS backend — controllers,
services, repositories, guards, and integration clients — together with the
dependency edges that Nest's injector actually wires. They are drawn from
`src/`, and constructor signatures shown here match the real code.

Because 23 modules will not fit in one legible picture, the class model is
presented as one shared-kernel diagram plus one diagram per major workflow
slice. Method lists are the public contract of each class, trimmed of private
helpers.

Notation: `+` public, `-` private, `<<interface>>` for injection contracts,
dashed arrows for optional (`@Optional()`) or `forwardRef` dependencies.

---

## 1. Shared Kernel

```mermaid
classDiagram
  class DatabaseService {
    <<Injectable>>
    +onModuleInit() Promise~void~
    +enableShutdownHooks(app) void
    +$transaction(fn) Promise
    +$executeRaw(sql) Promise
  }
  PrismaClient <|-- DatabaseService

  class AccessTokenGuard {
    <<CanActivate>>
    +canActivate(ctx) Promise~boolean~
    -extractBearerToken(request) string
  }

  class RolesGuard {
    <<CanActivate>>
    +canActivate(ctx) boolean
  }

  class AuthenticatedUser {
    <<interface>>
    +id: string
    +email: string
    +role: owner|contributor|admin
    +status: pending|active|suspended|deactivated
  }

  class ApplicationError {
    <<Error>>
    +message: string
    +code: string
    +statusCode: number
    +metadata: Record
  }
  class BadRequestApplicationError
  class ForbiddenApplicationError
  class NotFoundApplicationError
  class ConflictApplicationError
  ApplicationError <|-- BadRequestApplicationError
  ApplicationError <|-- ForbiddenApplicationError
  ApplicationError <|-- NotFoundApplicationError
  ApplicationError <|-- ConflictApplicationError

  class HttpExceptionFilter {
    <<ExceptionFilter>>
    +catch(exception, host) void
  }
  HttpExceptionFilter ..> ApplicationError : maps to code+status

  class RealtimeGateway {
    <<WebSocketGateway '/realtime'>>
    +afterInit(server) void
    +handleConnection(socket) Promise~void~
    -findUsableSession(token) Promise~AuthSession~
    -rejectConnection(socket, code) void
  }

  class RealtimePublisherService {
    <<Injectable>>
    +bindServer(server) void
    +isEnabled() boolean
    +publishToUser(userId, envelope) Promise~boolean~
  }

  class RealtimeEventEnvelope {
    <<type v1>>
    +eventId: string
    +type: string
    +version: 1
    +occurredAt: string
    +aggregateId: string
    +aggregateVersion: number
    +payload: TPayload
  }

  class RedisIoAdapter {
    <<IoAdapter>>
    +connectToRedis() Promise~void~
    +onModuleDestroy() Promise~void~
  }

  AccessTokenGuard --> DatabaseService
  AccessTokenGuard ..> AuthenticatedUser : attaches
  RealtimeGateway --> DatabaseService
  RealtimePublisherService --> RealtimeGateway
  RealtimePublisherService ..> RealtimeEventEnvelope
  RedisIoAdapter ..> RealtimeGateway : cross-instance fan-out
```

---

## 2. Identity, Session & GitHub Access

```mermaid
classDiagram
  class ManualAuthController {
    <<Controller 'auth'>>
    +forgotPassword(dto)
    +login(dto)
    +register(dto)
    +resetPassword(dto)
    +checkUsernameAvailability(query)
    +verifyEmail(dto)
    +resendEmailVerification(dto)
  }

  class SessionController {
    <<Controller 'auth'>>
    +logout(user)
    +me(user)
    +updateMyDetails(user, dto)
    +updateMyEmail(user, dto)
    +exportMyAccountData(user)
    +uploadIdentityDocument(user, dto)
    +changeMyPassword(user, dto)
    +updateMyPhone(user, dto)
    +updateMyPreferences(user, dto)
    +updateMyPrivacy(user, dto)
    +updateMyUsername(user, dto)
    +refresh(dto)
    +assignRole(user, id, dto)
  }

  class GitHubAuthController {
    <<Controller 'auth/github'>>
    +disconnectGitHubAccount(user)
    +completeGitHubAccountConnection(user, dto)
    +completeGitHubGet()
    +completeGitHubPost(dto)
    +startGitHub(query)
  }

  class GoogleAuthController {
    <<Controller 'auth/google'>>
    +completeGoogleGet()
    +completeGooglePost(dto)
    +startGoogle(query)
  }

  class AuthService {
    <<Injectable>>
    +register(dto, context) Promise~AuthSessionDto~
    +checkUsernameAvailability(username)
    +verifyEmail(dto, context) Promise~AuthSessionDto~
    +resendEmailVerification(dto)
    +login(dto, context) Promise~AuthSessionDto~
    +getCurrentUser(userId) Promise~AuthUserDto~
    +assignRole(actor, userId, dto)
  }

  class SessionService {
    <<Injectable>>
    +create(user, context) Promise~AuthSessionDto~
    +refresh(dto, context) Promise~AuthSessionDto~
    +logout(sessionId) Promise~void~
    +canAuthenticate(user) boolean
    +updateCurrentUserPreferences(userId, dto)
  }

  class SocialAuthService {
    <<Injectable>>
    +start(provider, role, intent) StartDto
    +startGitHub(role, intent) StartDto
    +startGoogle(role, intent) StartDto
    +complete(input) Promise~AuthSessionDto~
    +completeGitHub(input) Promise~AuthSessionDto~
    +completeGoogle(input) Promise~AuthSessionDto~
    +connectGitHubAccount(input) Promise~void~
    +disconnectGitHubAccount(userId) Promise~void~
  }

  class AccountSettingsService {
    <<Injectable>>
    +updatePersonalDetails(userId, dto)
    +updatePrivacy(userId, dto)
    +updatePhone(userId, dto)
    +updateEmail(userId, dto)
    +updateUsername(userId, dto)
    +changePassword(userId, dto)
    +uploadIdentityDocument(userId, file)
    +exportAccountData(userId)
  }

  class PasswordHasher {
    <<Injectable>>
    +hash(plain) Promise~string~
    +verify(plain, hash) Promise~boolean~
  }

  class SessionTokenService {
    <<Injectable>>
    +generate() TokenPair
    +hash(token) string
  }

  class IdentityAccountStatusService {
    <<Injectable>>
    +activateContributorAfterSkillApproval(userId) Promise~void~
    +getGitHubIdentityForUser(userId)
  }

  class PaymentCustomerProfileService {
    <<Injectable>>
    +getForUser(userId) Promise~CustomerProfile~
  }

  class GitHubAppService {
    <<Injectable>>
    +startConnection(user, dto)
    +completeConnection(user, dto)
    +processBrowserCallback(query)
    +getConnectionAttempt(user, attemptId)
    +listInstallationLinks(user)
    +listSelectedRepositories(user, query)
    +disconnect(user, installationLinkId)
    +verifyRepositorySelection(linkId, repoIds)
    +lockRepositorySelectionAuthorization(linkId)
  }

  class GitHubEvidenceService {
    <<Injectable>>
    +getSelectedSkillProfilingEvidence(linkId, repoIds)
    +getGitHubAppSkillProfilingEvidence(linkId)
    +verifySelectedRepositoryControl(linkId, repoIds)
    +getProjectImportSnapshot(input)
    +getRepositoryReadme(input)
    +getRepositoryStatistics(input)
  }

  class GitHubAccountService {
    <<Injectable>>
    +getStatusForUser(userId)
    +getAccessToken(userId)
    +getConnectedUsername(userId)
    +markRepositoryImportPrepared(userId)
  }

  class GitHubAppWebhookService {
    <<Injectable>>
    +process(signature, event, payload) Promise~void~
  }

  ManualAuthController --> AuthService
  SessionController --> SessionService
  SessionController --> AccountSettingsService
  GitHubAuthController --> SocialAuthService
  GoogleAuthController --> SocialAuthService
  AuthService --> PasswordHasher
  AuthService --> SessionService
  SessionService --> SessionTokenService
  SessionService --> DatabaseService
  SocialAuthService --> SessionService
  GitHubAppService --> DatabaseService
  GitHubEvidenceService --> GitHubAppService
  GitHubAppWebhookService --> DatabaseService
```

---

## 3. Work Definition — Projects, Requests & Proposals

```mermaid
classDiagram
  class ProjectsController {
    <<Controller 'projects'>>
    +createDraft(user, dto)
    +listCategories(user)
    +listDifficulties(user)
    +discoverProjects(user, query)
    +preview(user, dto)
    +importFromGitHub(user)
    +getMyProjects(user, query)
    +getOwnerProject(user, projectId)
    +updateOwnerProject(user, projectId, dto)
    +archive(user, projectId, dto)
    +getHeroImage(user, projectId)
    +uploadHeroImage(user, projectId, dto)
    +publish(user, projectId, dto)
    +refreshSource(user, projectId, dto)
  }

  class PublicProjectsController {
    <<Controller 'public/projects'>>
    +list(query)
    +getBySlug(projectSlug)
    +listApplicants(projectSlug)
    +getHeroImage(projectSlug)
    +unsave(user, projectSlug)
    +getSavedState(user, projectSlug)
    +save(user, projectSlug)
  }

  class ContributionTasksController {
    <<Controller>>
    +getOwnedRequest(user, requestId)
    +updateDraft(user, requestId, dto)
    +cancelRequest(user, requestId, dto)
    +discardDraft(user, requestId, dto)
    +publishRequest(user, requestId)
    +listSkillRequirements(user, requestId)
    +replaceSkillRequirements(user, requestId, dto)
    +listForOwnedProject(user, projectId)
    +createDraft(user, projectId, dto)
  }

  class ContributionProposalsController {
    <<Controller 'contribution-proposals'>>
    +submit(user, dto)
    +getForActor(user, proposalId)
    +accept(user, proposalId, dto)
    +decline(user, proposalId, dto)
    +reportMisuse(user, proposalId, dto)
    +requestRevision(user, proposalId, dto)
    +submitVersion(user, proposalId, dto)
    +withdraw(user, proposalId)
    +listForProject(user, projectId, query)
    +getIntake(user, projectId)
    +setIntake(user, projectId, dto)
    +listMine(user, query)
  }

  class ProjectsService {
    <<Injectable>>
    +getMyProjects(user, query)
    +discoverPublishedProjects(query)
    +listPublishedProjectOwners(query)
    +getMaterialProjectContext(input)
    +getProposalProjectContext(input)
    +lockContributionRequestProjectPublication(input)
    +getContributionRequestPublicationEntitlement(input)
  }

  class ProjectPublicationService {
    <<Injectable>>
    +preview(user, dto)
    +createDraft(user, dto)
    +getOwnerProject(user, projectId)
    +updateProject(user, projectId, dto)
    +refreshSource(user, projectId)
    +publish(user, projectId, dto)
    +archive(user, projectId, dto)
    +uploadHeroImage(user, projectId, revision, file, key)
    +getOwnerHeroImage(user, projectId)
  }

  class ContributionTasksService {
    <<Injectable>>
    +createDraft(input) Promise~RequestDto~
    +createDraftFromAcceptedProposal(input) Promise~RequestDto~
    +updateDraft(input) Promise~RequestDto~
    +discardDraft(input) Promise~RequestDto~
    +getPublishedMatchingContext(requestId) Promise~MatchingContext~
    +listOpenRequestsForMatching(input) Promise~RequestScope[]~
    +getApplicationSubmissionContext(input) Promise~SubmissionContext~
    +lockApplicationSubmissionContext(input) Promise~SubmissionContext~
    +assignFromOwnerDecision(input) Promise~void~
    +completeFromDeliveryReview(input) Promise~void~
    +getMaterialAssignmentAccess(input) Promise~AccessScope~
  }

  class ContributionRequestPublicationService {
    <<Injectable>>
    +publishRequest(input) Promise~RequestDto~
    +cancelRequest(input) Promise~RequestDto~
  }

  class ContributionRequestSkillRequirementsService {
    <<Injectable>>
    +listForOwner(user, requestId)
    +replaceOwnerSkillRequirements(user, requestId, dto)
    +readSnapshotRows(requestId)
  }

  class RequirementInferenceProcessorService {
    <<Injectable>>
    +process(requestId) Promise~void~
  }

  class RequirementInferenceQueue {
    <<Injectable>>
    +enqueueInference(job) Promise~void~
  }

  ProjectsController --> ProjectsService
  ProjectsController --> ProjectPublicationService
  PublicProjectsController --> ProjectsService
  ContributionTasksController --> ContributionTasksService
  ContributionTasksController --> ContributionRequestPublicationService
  ContributionTasksController --> ContributionRequestSkillRequirementsService
  ContributionProposalsController --> ContributionProposalsService
  ContributionProposalsService --> ContributionTasksService : creates attributed draft
  ContributionTasksService --> DatabaseService
  ContributionRequestPublicationService --> ContributionTasksService
  RequirementInferenceProcessorService --> AiService
  RequirementInferenceProcessorService --> ContributionRequestSkillRequirementsService
  ContributionTasksService ..> RequirementInferenceQueue : after commit
```

---

## 4. Eligibility, Applications & Advisory Fit

This is the slice where the "AI advises, backend decides" rule is enforced in
code: `EligibilityService` is deterministic, and `AdvisoryFitAssessmentService`
writes only into assessment tables.

```mermaid
classDiagram
  class ApplicationsController {
    <<Controller>>
    +getForActor(user, applicationId)
    +accept(user, applicationId)
    +getAssessment(user, applicationId)
    +requestAssessment(user, applicationId, dto)
    +presentAssessment(user, applicationId)
    +decline(user, applicationId, dto)
    +withdraw(user, applicationId)
    +listForOwner(user, requestId)
    +submit(user, requestId, dto)
  }

  class EligibilityController {
    <<Controller, Roles contributor>>
    +previewForRequest(user, requestId)
  }

  class ApplicationsService {
    <<Injectable>>
    +submit(input) Promise~ApplicationDto~
    +withdraw(input) Promise~ApplicationDto~
    +accept(input) Promise~ApplicationDto~
    +decline(input) Promise~ApplicationDto~
    +listForOwner(input) Promise~ApplicationDto[]~
    +getForActor(input) Promise~ApplicationDto~
    +summarizePendingByContributionRequests(input) Promise~Counts~
    +cancelPendingForRequest(input) Promise~void~
    +lockDeliverySubmissionContext(input) Promise~DeliveryContext~
    +listDeliveryLifecycleContextsForOwner(ownerId) Promise~Context[]~
  }

  class EligibilityService {
    <<Injectable>>
    +evaluateForRequest(input) Promise~EligibilityEvaluation~
    +computeVerdict(input) Promise~Verdict~
    +recordProposalEvaluation(input) Promise~EligibilityEvaluation~
    +recordBlocked(input) Promise~EligibilityEvaluation~
    +previewForRequest(input) Promise~EligibilityPreviewDto~
    +blockedError(blockingSkills) ApplicationBlockedBySkillGap
  }

  class skill-level-comparison {
    <<pure functions>>
    +meetsLevel(held, required) boolean
    +indexApprovedSkills(skills) Map
    +findBlockingSkills(required, held) BlockingSkill[]
  }

  class ApplicationDailyQuotaService {
    <<Injectable>>
    +reserve(userId, limit) Promise~void~
    +read(userId) Promise~number~
  }

  class application-review-window-policy {
    <<pure functions>>
    +APPLICATION_REVIEW_REMINDER_DAYS = 3
    +APPLICATION_REVIEW_OVERDUE_DAYS = 5
    +APPLICATION_REVIEW_EXPIRY_DAYS = 7
  }

  class ApplicationReviewWindowService {
    <<Injectable>>
    +processDue(now) Promise~SweepResult~
    +remindDueOwners(now) Promise~number~
    +expireDueApplications(now) Promise~number~
  }

  class AdvisoryFitAssessmentService {
    <<Injectable>>
    +request(input) Promise~AssessmentRequestDto~
    +getAssessment(input) Promise~AssessmentDto~
    +presentAssessment(input) Promise~AssessmentDto~
  }

  class AdvisoryFitAssessmentProcessorService {
    <<Injectable>>
    +process(assessmentRequestId) Promise~void~
  }

  class AdvisoryFitAssessmentReaperService {
    <<Injectable>>
    +reapStale(now) Promise~number~
  }

  class AdvisoryFitAssessmentQueue {
    <<Injectable>>
    +enqueueAssessment(job) Promise~void~
    +scheduleReaper() Promise~void~
  }

  class ApplicationBlockedBySkillGap {
    <<ApplicationError>>
    +blockingSkills: BlockingSkillDto[]
  }

  ApplicationsController --> ApplicationsService
  ApplicationsController --> AdvisoryFitAssessmentService
  EligibilityController --> EligibilityService

  ApplicationsService --> DatabaseService
  ApplicationsService --> ContributionTasksService
  ApplicationsService --> SkillProfileSummaryService
  ApplicationsService --> EligibilityService
  ApplicationsService --> IdentityUsernameService
  ApplicationsService --> NotificationsService
  ApplicationsService --> ContributorProfilesService
  ApplicationsService --> ApplicationDailyQuotaService
  ApplicationsService ..> AssignmentConversationsService : optional

  EligibilityService --> DatabaseService
  EligibilityService --> ContributionTasksService
  EligibilityService --> SkillProfileSummaryService
  EligibilityService ..> skill-level-comparison
  EligibilityService ..> ApplicationBlockedBySkillGap : raises

  AdvisoryFitAssessmentService --> DatabaseService
  AdvisoryFitAssessmentService --> ContributionTasksService
  AdvisoryFitAssessmentService --> AdvisoryFitAssessmentQueue
  AdvisoryFitAssessmentQueue ..> AdvisoryFitAssessmentProcessorService : worker
  AdvisoryFitAssessmentProcessorService --> AiService
  ApplicationReviewWindowService ..> application-review-window-policy
  ApplicationsService ..> application-review-window-policy
```

---

## 5. Assignment, Conversation & Delivery

```mermaid
classDiagram
  class AssignmentConversationsController {
    <<Controller>>
    +list(user, query)
    +get(user, conversationId)
    +listMessages(user, conversationId, query)
    +sendMessage(user, conversationId, dto)
  }

  class DeliveryReviewsController {
    <<Controller>>
    +submit(user, applicationId, dto)
    +getForActor(user, deliveryId)
    +update(user, deliveryId, dto)
    +review(user, deliveryId, dto)
    +listContributorLifecycle(user)
    +listReviewQueue(user)
    +listOwnerLifecycle(user)
  }

  class AssignmentConversationsService {
    <<Injectable>>
    +ensureForAssignment(tx, input) Promise~Conversation~
    +listForActor(user, query)
    +getForActor(user, conversationId)
    +listMessages(user, conversationId, query)
    +sendMessage(input) Promise~MessageDto~
  }

  class DeliveryReviewsService {
    <<Injectable>>
    +submit(input) Promise~DeliveryDto~
    +update(input) Promise~DeliveryDto~
    +review(input) Promise~DeliveryDto~
    +getForActor(input) Promise~DeliveryDto~
    +listReviewQueue(input) Promise~DeliveryDto[]~
    +listContributorLifecycle(input) Promise~LifecycleDto[]~
    +listOwnerLifecycle(input) Promise~LifecycleDto[]~
  }

  class DeliveryApprovedEventsService {
    <<Injectable>>
    +append(tx, input) Promise~DeliveryApprovedEvent~
    +listPending(limit)
    +markPublished(eventId) Promise~void~
  }

  class DeliveryReputationProjectionService {
    <<Injectable>>
    +processPendingApprovals() Promise~number~
    +projectContributor(contributorId) Promise~void~
    +reconcileAssignedContributors() Promise~number~
  }

  class DeliveryReputationQueue {
    <<Injectable>>
    +schedule() Promise~void~
    +enqueueCatchUp() Promise~void~
  }

  class ReputationService {
    <<Injectable>>
    +getSummaryForUser(userId) Promise~ReputationDto~
    +listSummariesForUsers(userIds)
    +replaceProjection(userId, facts) Promise~void~
  }

  class BadgesService {
    <<Injectable>>
    +awardFirstContributionIfEligible(input) Promise~UserBadge~
    +listForUser(userId)
  }

  DeliveryReviewsController --> DeliveryReviewsService
  AssignmentConversationsController --> AssignmentConversationsService

  DeliveryReviewsService --> DatabaseService
  DeliveryReviewsService --> ApplicationsService
  DeliveryReviewsService --> ContributionTasksService
  DeliveryReviewsService --> NotificationsService
  DeliveryReviewsService --> DeliveryApprovedEventsService
  DeliveryReviewsService --> BadgesService
  DeliveryApprovedEventsService ..> DeliveryReputationQueue : after commit
  DeliveryReputationQueue ..> DeliveryReputationProjectionService : worker
  DeliveryReputationProjectionService --> ReputationService
  AssignmentConversationsService --> RealtimePublisherService
  ApplicationsService ..> AssignmentConversationsService : opens on accept
```

---

## 6. Skill Profiles, Guidance & Matching

```mermaid
classDiagram
  class SkillProfilesController {
    <<Controller 'skill-profiles'>>
    +startGeneration(user, dto)
    +getGeneration(user, generationId)
    +retryGeneration(user, generationId, dto)
    +getLatestGeneration(user)
  }

  class AdminSkillReviewsController {
    <<Controller 'admin/skill-reviews', Roles admin>>
    +approve(user, skillProfileId, dto)
    +adjustProficiency(user, skillProfileId, dto)
    +reject(user, skillProfileId, dto)
    +listPending(user, query)
  }

  class RecommendationsController {
    <<Controller 'contributors/me', Roles contributor>>
    +list(user)
  }

  class OwnerContributorMatchingController {
    <<Controller, Roles owner>>
    +generate(user, requestId)
  }

  class SkillProfilesService {
    <<Injectable>>
    +startGeneration(input) Promise~GenerationDto~
    +retryGeneration(input) Promise~GenerationDto~
    +getGeneration(input) Promise~GenerationDto~
    +getLatestGeneration(userId) Promise~GenerationDto~
  }

  class SkillProfileGenerationService {
    <<Injectable>>
    +process(generationId) Promise~void~
    +transitionUnresolvedLegacyCandidates(now) Promise~number~
  }

  class SkillProfileGenerationRepository {
    <<Injectable>>
    +create(input) Promise~Generation~
    +findById(id)
    +findLatestForUser(userId)
    +updateStatus(id, status) Promise~void~
    +completeWithPendingSkills(id, candidates) Promise~void~
    +completeNeedsMoreEvidence(id, reason) Promise~void~
    +fail(id, reason) Promise~void~
    +transitionUnresolvedLegacyCandidates(now) Promise~number~
  }

  class SkillProfilesReviewService {
    <<Injectable>>
    +listPendingReviews(input)
    +approve(input) Promise~SkillProfileDto~
    +reject(input) Promise~SkillProfileDto~
    +adjustProficiency(input) Promise~SkillProfileDto~
  }

  class SkillProfileSummaryService {
    <<Injectable>>
    +listApprovedSkillsForEligibility(userId)
    +listAuthorizedSkillsForApplicationSnapshot(userId)
    +listApprovedContributorMatchingSnapshots(userIds)
    +listSkillsForProfile(userId)
  }

  class SkillProfileGenerationQueue {
    <<Injectable>>
    +enqueue(job) Promise~void~
    +hasJob(id) Promise~boolean~
    +isEnabled() boolean
  }

  class MatchingService {
    <<Injectable>>
    +shortlistForContributor(input) Promise~ShortlistedMatch[]~
  }

  class RecommendedTasksService {
    <<Injectable>>
    +listForContributor(user, query) Promise~RecommendedTaskDto[]~
  }

  class OwnerContributorMatchingService {
    <<Injectable>>
    +generate(user, requestId, dto) Promise~AiMatchResultDto[]~
  }

  class MatchRanker {
    <<pure functions>>
    +rerank(input)* Promise~ShortlistedMatch[]~
  }

  class skill-fit {
    <<pure functions>>
    +prepareApprovedSkills(skills) PreparedSkill[]
    +assessSkillFit(required, prepared) SkillFit
  }

  class AiMatchRanker {
    <<Injectable>>
    +rerank(input) Promise~ShortlistedMatch[]~
  }

  class SkillGapGuidanceController {
    <<Controller 'contributors/me/skill-gap-guidance'>>
    +generate(user, dto)
    +stream(user, query) Observable
  }

  class EligibilityGuidanceController {
    <<Controller 'contributors/me/eligibility-guidance'>>
    +list(user, query)
    +request(user, dto)
    +get(user, guidanceId)
  }

  class SkillGapGuidanceService {
    <<Injectable>>
    +generate(actor, contributionRequestId) Promise~SkillGapGuidanceDto~
  }

  SkillProfilesController --> SkillProfilesService
  AdminSkillReviewsController --> SkillProfilesReviewService
  RecommendationsController --> RecommendedTasksService
  OwnerContributorMatchingController --> OwnerContributorMatchingService
  SkillGapGuidanceController --> SkillGapGuidanceService
  EligibilityGuidanceController --> EligibilityGuidanceService

  SkillProfilesService --> SkillProfileGenerationRepository
  SkillProfilesService --> GitHubAppService
  SkillProfilesService ..> SkillProfileGenerationQueue : after commit
  SkillProfileGenerationQueue ..> SkillProfileGenerationService : worker
  SkillProfileGenerationService --> SkillProfileGenerationRepository
  SkillProfileGenerationService --> GitHubEvidenceService
  SkillProfileGenerationService --> AiService
  SkillProfileGenerationService ..> NotificationsService : optional
  SkillProfilesReviewService --> IdentityAccountStatusService
  SkillProfilesReviewService --> NotificationsService

  RecommendedTasksService --> MatchingService
  RecommendedTasksService ..> MatchRanker : optional, feature-flagged
  MatchRanker <|.. AiMatchRanker
  MatchingService --> EntitlementsService
  MatchingService --> SkillProfileSummaryService
  MatchingService --> ContributionTasksService
  MatchingService --> ApplicationsService
  MatchingService --> ReputationService
  MatchingService ..> skill-fit
  AiMatchRanker --> AiService
  OwnerContributorMatchingService --> AiService
  SkillGapGuidanceService --> AiService
  EligibilityGuidanceService ..> EligibilityGuidanceQueue : after commit
  EligibilityGuidanceQueue ..> AiService : worker
```

---

## 7. Materials & Material Analysis

```mermaid
classDiagram
  class MaterialsController {
    <<Controller>>
    +listForContributionRequest(user, requestId)
    +createForContributionRequest(user, requestId, dto)
    +download(user, query)
    +getUploadConstraints(user)
    +getForReader(user, materialId)
    +remove(user, materialId, dto)
    +listGrants(user, materialId)
    +grant(user, materialId, dto)
    +revoke(user, materialId, granteeId, dto)
    +addVersion(user, materialId, dto)
    +issueDownloadToken(user, materialId, version)
    +changeVisibility(user, materialId, dto)
    +listForProject(user, projectId)
    +createForProject(user, projectId, dto)
  }

  class MaterialAnalysisController {
    <<Controller>>
    +getRun(user, runId)
    +startSet(user, analysisSetId)
    +adoptContributionRequestSuggestion(user, suggestionId, dto)
    +adoptProjectSuggestion(user, suggestionId, dto)
    +rejectSuggestion(user, suggestionId)
    +getConstraints(user, projectId)
    +listSets(user, projectId)
    +createSet(user, projectId, dto)
  }

  class MaterialsService {
    <<Injectable>>
    +createForProject(input) Promise~MaterialDto~
    +createForContributionRequest(input) Promise~MaterialDto~
    +addVersion(input) Promise~MaterialVersionDto~
    +getUploadConstraints() MaterialUploadConstraintsDto
    +getForReader(input) Promise~MaterialDto~
    +issueDownloadToken(input) Promise~DownloadTokenDto~
    +openDownload(token) Promise~DownloadStream~
    +remove(input) Promise~void~
  }

  class MaterialAccessService {
    <<Injectable>>
    +requireReadAccess(user, materialId) Promise~MaterialScope~
    +requireDownloadableVersion(materialId, version) Promise~MaterialVersion~
  }

  class MaterialGrantsService {
    <<Injectable>>
    +grant(input) Promise~MaterialGrantDto~
    +revoke(input) Promise~void~
    +listGrants(input) Promise~MaterialGrantDto[]~
    +changeVisibility(input) Promise~MaterialDto~
  }

  class MaterialDownloadTokenService {
    <<Injectable>>
    +issue(input) string
    +verify(token) DownloadClaim
  }

  class MaterialAnalysisService {
    <<Injectable>>
    +createSet(input) Promise~AnalysisSetDto~
    +listSets(input)
    +getConstraints(input)
    +startSet(input) Promise~AnalysisRunDto~
    +processRun(runId) Promise~void~
    +getRun(input) Promise~AnalysisRunDto~
    +rejectSuggestion(input) Promise~SuggestionDto~
    +adoptProjectSuggestion(input) Promise~SuggestionDto~
    +adoptContributionRequestSuggestion(input) Promise~SuggestionDto~
  }

  class MaterialStorage {
    <<interface>>
    +put(storageKey, content)* Promise~StoredObject~
    +getStream(storageKey)* Promise~Readable~
    +delete(storageKey)* Promise~void~
    +exists(storageKey)* Promise~boolean~
  }
  class LocalMaterialStorage
  MaterialStorage <|.. LocalMaterialStorage

  class MalwareScanner {
    <<interface>>
    +scan(input)* Promise~MalwareScanVerdict~
  }
  class StubMalwareScanner
  MalwareScanner <|.. StubMalwareScanner

  class MaterialScanQueue {
    +enqueueScan(job) Promise~void~
    +scheduleReaper() Promise~void~
  }
  class MaterialAnalysisQueue {
    +enqueueRun(job) Promise~void~
    +scheduleReaper() Promise~void~
  }
  class MaterialScanProcessorService {
    +process(versionId) Promise~void~
  }

  MaterialsController --> MaterialsService
  MaterialsController --> MaterialGrantsService
  MaterialAnalysisController --> MaterialAnalysisService
  MaterialsService --> ProjectsService
  MaterialsService --> ContributionTasksService
  MaterialsService --> MaterialAccessService
  MaterialsService --> MaterialStorage
  MaterialsService --> MaterialDownloadTokenService
  MaterialsService --> MaterialPurgeService
  MaterialsService ..> MaterialScanQueue : after commit
  MaterialScanQueue ..> MaterialScanProcessorService : worker
  MaterialScanProcessorService --> MalwareScanner
  MaterialAnalysisService --> DatabaseService
  MaterialAnalysisService --> ProjectsService
  MaterialAnalysisService --> MaterialStorage
  MaterialAnalysisService --> AiService
  MaterialAnalysisService --> EntitlementsService
  MaterialAnalysisService ..> MaterialAnalysisQueue : optional
  MaterialAnalysisService ..> ProjectPublicationService : optional
  MaterialAnalysisService ..> ContributionTasksService : optional
```

---

## 8. Commerce — Subscriptions & Payments

```mermaid
classDiagram
  class SubscriptionCatalogController {
    <<Controller 'subscriptions'>>
    +getPlans()
  }
  class SubscriptionsController {
    <<Controller 'me', Roles owner|contributor>>
    +getCurrentPlan(user)
  }
  class PaymentsController {
    <<Controller 'me', Roles owner|contributor>>
    +getPaymentStatus(user, paymentId)
    +createCheckout(user, dto)
  }
  class PaymobWebhookController {
    <<Controller 'payments/paymob'>>
    +receive(rawBody, query)
  }

  class EntitlementsService {
    <<Injectable>>
    +getPlanCatalog() PlanEntry[]
    +getPlanCatalogEntry(planType) PlanEntry
    +assertPlanPurchaseAllowed(userId, roleContext, planType) Promise~void~
    +resolve(userId, roleContext) Promise~Entitlement~
    +resolveForOwner(userId) Promise~Entitlement~
    +resolveForContributor(userId) Promise~Entitlement~
    +hasMinimumOwnerPlan(userId, plan) Promise~boolean~
    +resolveMaterialAnalysisEntitlement(userId) Promise~Entitlement~
    +assignPlan(input) Promise~Subscription~
    +activatePurchasedPlan(input) Promise~Subscription~
  }

  class SubscriptionStatusService {
    <<Injectable>>
    +getPlanStatus(user, roleContext) Promise~SubscriptionStatusDto~
  }

  class PaymentsService {
    <<Injectable>>
    +createCheckout(input) Promise~PaymentCheckoutDto~
    +getPaymentStatus(input) Promise~PaymentStatusDto~
    -assertSameCheckout(existing, requested) void
    -completePendingCheckout(attempt) Promise~PaymentCheckoutDto~
  }

  class PaymentWebhookService {
    <<Injectable>>
    +process(input) Promise~PaymentWebhookResult~
    -recordInvalidCallback(payload, error) Promise~void~
    -paymentIdFromReference(merchantOrderId) string
  }

  class PaymentProvider {
    <<interface PAYMENT_PROVIDER>>
    +createPaymentIntention(input) Promise~ProviderIntention~
    +verifyAndNormalizeTransactionCallback(input) NormalizedPaymentTransaction
  }
  class PaymobClient
  PaymentProvider <|.. PaymobClient

  class payment-attempt-state {
    <<pure functions>>
    +transitionPaymentAttemptStatus(from, to) PaymentAttemptStatus
  }
  class payment-webhook-event {
    <<pure functions>>
    +minimizePaymentWebhookPayload(tx) MinimizedPayload
    +createPaymentWebhookFingerprint(provider, minimized) string
  }

  SubscriptionCatalogController --> EntitlementsService
  SubscriptionsController --> SubscriptionStatusService
  PaymentsController --> PaymentsService
  PaymobWebhookController --> PaymentWebhookService
  PaymentsService --> DatabaseService
  PaymentsService --> EntitlementsService
  PaymentsService --> PaymentCustomerProfileService
  PaymentsService --> PaymentProvider
  PaymentWebhookService --> DatabaseService
  PaymentWebhookService --> EntitlementsService
  PaymentWebhookService --> PaymentProvider
  PaymentWebhookService ..> payment-attempt-state
  PaymentWebhookService ..> payment-webhook-event
```

---

## 9. Notifications

```mermaid
classDiagram
  class NotificationsController {
    <<Controller>>
    +getPreferences(user)
    +updatePreferences(user, dto)
    +list(user, query)
    +markReadCompatibility(user, notificationId)
    +setReadState(user, notificationId, dto)
    +markAllRead(user)
    +markAllReadCompatibility(user)
    +unreadCount(user, query)
  }

  class NotificationsService {
    <<Injectable>>
    +createSkillReviewNotification(input) Promise~Notification~
    +createSkillProfileGenerationNotification(input) Promise~Notification~
    +createApplicationNotification(input) Promise~Notification~
    +createProposalNotification(input) Promise~Notification~
    +createConversationActivityNotification(input) Promise~Notification~
    +createDeliveryNotification(input) Promise~Notification~
    +createBadgeNotification(input) Promise~Notification~
    +emitNotificationCreated(notificationId) Promise~boolean~
    +emitApplicationNotifications(ids) void
  }

  class NotificationInboxService {
    <<Injectable>>
    +list(user, query) Promise~InboxPage~
    +unreadCount(userId) Promise~number~
    +setReadState(input) Promise~NotificationDto~
    +markAllRead(input) Promise~number~
  }

  class NotificationPresenterService {
    <<Injectable>>
    +present(notification, language) NotificationDto
  }

  class NotificationEventsService {
    <<Injectable>>
    +appendCreated(tx, notification) Promise~NotificationEvent~
    +appendReadStateChanged(tx, notification) Promise~NotificationEvent~
  }

  class NotificationRealtimeService {
    <<Injectable>>
    +publishCreated(notificationId) Promise~boolean~
    +publishReadStateChanged(notificationId) Promise~boolean~
    +publishEvent(event) Promise~boolean~
  }

  class NotificationEventRecoveryService {
    <<Injectable>>
    +recoverPending() Promise~number~
  }

  class NotificationRetentionService {
    <<Injectable>>
    +purgeExpired() Promise~number~
  }

  class NotificationPreferencesService {
    <<Injectable>>
    +get(userId) Promise~PreferencesDto~
    +update(userId, dto) Promise~PreferencesDto~
  }

  NotificationsController --> NotificationInboxService
  NotificationsController --> NotificationPreferencesService
  NotificationsService --> DatabaseService
  NotificationsService --> NotificationPresenterService
  NotificationsService --> NotificationEventsService
  NotificationsService ..> NotificationRealtimeService : optional
  NotificationInboxService --> NotificationPresenterService
  NotificationInboxService --> NotificationEventsService
  NotificationInboxService ..> NotificationRealtimeService : optional
  NotificationRealtimeService --> RealtimePublisherService
  NotificationEventRecoveryService --> NotificationRealtimeService
  NotificationEventRecoveryService --> NotificationEventsService
```

---

## 10. The AI Boundary as Classes

```mermaid
classDiagram
  class AiService {
    <<Injectable>>
    +generateSkillProfile(input) Promise~SkillProfileResult~
    +requestAdvisoryFit(input) Promise~AdvisoryFitAssessmentResult~
    +requestMaterialAnalysis(input) Promise~MaterialAnalysisResult~
    +requestSkillGapGuidance(input) Promise~SkillGapGuidanceResult~
    +inferRequirementSkills(input) Promise~RequirementInferenceResult~
    +rankMatches(input) Promise~MatchingRankResult~
    +requestContributorMatching(input) Promise~ContributorMatchingResult~
  }

  class FastApiSkillProfileClient {
    +generate(input) Promise~SkillProfileResult~
  }
  class AdvisoryFitClient {
    +assess(input) Promise~AdvisoryFitAssessmentResult~
  }
  class MaterialAnalysisClient {
    +analyze(input) Promise~MaterialAnalysisResult~
  }
  class SkillGapGuidanceClient {
    +generate(input) Promise~SkillGapGuidanceResult~
  }
  class RequirementInferenceClient {
    +infer(input) Promise~RequirementInferenceResult~
  }
  class MatchingRankClient {
    +rank(input) Promise~MatchingRankResult~
  }
  class ContributorMatchingClient {
    +generate(input) Promise~ContributorMatchingResult~
  }

  AiService --> FastApiSkillProfileClient
  AiService ..> AdvisoryFitClient : optional
  AiService ..> MaterialAnalysisClient : optional
  AiService ..> SkillGapGuidanceClient : optional
  AiService ..> RequirementInferenceClient : optional
  AiService ..> MatchingRankClient : optional
  AiService ..> ContributorMatchingClient : optional
```

Each client is constructed with `ConfigService` only and reads its own
`AI_*_PATH` and `AI_*_TIMEOUT_MS`. A missing client is not a crash: `AiService`
raises `ApplicationError` with a `*_CLIENT_NOT_CONFIGURED` code and HTTP `503`,
so an unconfigured AI feature degrades to an explicit, retriable unavailability
rather than a silent wrong answer.
