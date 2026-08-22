# API Route Reference

<!-- GENERATED FILE. Run `npm run docs:routes` to regenerate. Do not edit by hand. -->

Every HTTP route the NestJS backend serves: **195 routes** across **22 modules**, extracted from the `@Controller` classes in `src/`.

There is no global route prefix. Paths are served from the application root (`PORT`, default `4000`).

Column meanings:

- **Auth** — `public` means no `AccessTokenGuard`; `bearer` means an opaque access token is required; roles listed after `·` come from `@Roles(...)`.
- **Notes** — `idempotency key` marks commands that accept a client-supplied UUID and are safe to retry; `multipart` and `raw body` mark non-JSON bodies.

For behaviour, error codes, and payload rules see [`api-contracts.md`](./api-contracts.md). For runnable examples see [`postman-api-guide.md`](./postman-api-guide.md) and `sharek-api.http`.

## Contents

- [Admin](#admin) — 18 routes
- [Applications, Assessments & Owner Decisions](#applications-assessments--owner-decisions) — 9 routes
- [Assignment Conversations](#assignment-conversations) — 4 routes
- [assignment-calls](#assignment-calls) — 7 routes
- [Chat Attachments](#chat-attachments) — 3 routes
- [Contribution Proposals](#contribution-proposals) — 12 routes
- [Contribution Requests](#contribution-requests) — 11 routes
- [Contributor Dashboard](#contributor-dashboard) — 1 route
- [Contributor Profiles](#contributor-profiles) — 8 routes
- [Deliveries & Reviews](#deliveries--reviews) — 7 routes
- [Eligibility Gate](#eligibility-gate) — 1 route
- [GitHub Connection](#github-connection) — 20 routes
- [Health](#health) — 1 route
- [Identity, Auth & Session](#identity-auth--session) — 27 routes
- [Matching & Recommendations](#matching--recommendations) — 2 routes
- [Materials & Material Analysis](#materials--material-analysis) — 22 routes
- [Notifications](#notifications) — 8 routes
- [Payments](#payments) — 3 routes
- [Projects](#projects) — 21 routes
- [Skill Gap & Eligibility Guidance](#skill-gap--eligibility-guidance) — 4 routes
- [Skill Profiles](#skill-profiles) — 4 routes
- [Subscriptions](#subscriptions) — 2 routes

## Admin

Module: `src/modules/admin/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/admin/contributor-field-categories` | bearer · admin | 200 | `AdminContributorFieldCategoriesController.list` | — |
| `POST` | `/admin/contributor-field-categories` | bearer · admin | 201 | `AdminContributorFieldCategoriesController.create` | — |
| `PATCH` | `/admin/contributor-field-categories/:categoryId` | bearer · admin | 200 | `AdminContributorFieldCategoriesController.update` | — |
| `GET` | `/admin/contributor-fields` | bearer · admin | 200 | `AdminContributorFieldsController.list` | — |
| `POST` | `/admin/contributor-fields` | bearer · admin | 201 | `AdminContributorFieldsController.create` | — |
| `PATCH` | `/admin/contributor-fields/:fieldId` | bearer · admin | 200 | `AdminContributorFieldsController.update` | — |
| `GET` | `/admin/experience-levels` | bearer · admin | 200 | `AdminExperienceLevelsController.list` | — |
| `POST` | `/admin/experience-levels` | bearer · admin | 201 | `AdminExperienceLevelsController.create` | — |
| `PATCH` | `/admin/experience-levels/:levelId` | bearer · admin | 200 | `AdminExperienceLevelsController.update` | — |
| `GET` | `/admin/identity-verifications` | bearer · admin | 200 | `AdminIdentityVerificationController.list` | query: page, limit, status |
| `PATCH` | `/admin/identity-verifications/:userId` | bearer · admin | 200 | `AdminIdentityVerificationController.review` | — |
| `GET` | `/admin/identity-verifications/:userId/document` | bearer · admin | 200 | `AdminIdentityVerificationController.getDocument` | — |
| `GET` | `/admin/published-project-owners` | bearer · admin | 200 | `AdminPublishedProjectOwnersController.list` | — |
| `POST` | `/admin/skill-reviews/:skillProfileId/approve` | bearer · admin | 200 | `AdminSkillReviewsController.approve` | — |
| `PATCH` | `/admin/skill-reviews/:skillProfileId/proficiency` | bearer · admin | 200 | `AdminSkillReviewsController.adjustProficiency` | — |
| `POST` | `/admin/skill-reviews/:skillProfileId/reject` | bearer · admin | 200 | `AdminSkillReviewsController.reject` | — |
| `GET` | `/admin/skill-reviews/pending` | bearer · admin | 200 | `AdminSkillReviewsController.listPending` | query: page, limit |
| `POST` | `/owner-decisions/:ownerDecisionId/reports` | bearer | 201 | `DecisionFeedbackReportsController.create` | — |

## Applications, Assessments & Owner Decisions

Module: `src/modules/applications/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/applications/:applicationId` | bearer | 200 | `ApplicationsController.getForActor` | — |
| `POST` | `/applications/:applicationId/accept` | bearer | 200 | `ApplicationsController.accept` | idempotency key |
| `GET` | `/applications/:applicationId/assessment` | bearer | 200 | `ApplicationsController.getAssessment` | — |
| `POST` | `/applications/:applicationId/assessment-requests` | bearer | 202 | `ApplicationsController.requestAssessment` | idempotency key |
| `POST` | `/applications/:applicationId/assessment/presentations` | bearer | 200 | `ApplicationsController.presentAssessment` | — |
| `POST` | `/applications/:applicationId/decline` | bearer | 200 | `ApplicationsController.decline` | idempotency key |
| `POST` | `/applications/:applicationId/withdraw` | bearer | 200 | `ApplicationsController.withdraw` | idempotency key |
| `GET` | `/tasks/:requestId/applications` | bearer | 200 | `ApplicationsController.listForOwner` | — |
| `POST` | `/tasks/:requestId/applications` | bearer | 201 | `ApplicationsController.submit` | idempotency key |

## Assignment Conversations

Module: `src/modules/assignment-conversations/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/assignment-conversations` | bearer | 200 | `AssignmentConversationsController.list` | query: cursor, limit |
| `GET` | `/assignment-conversations/:conversationId` | bearer | 200 | `AssignmentConversationsController.get` | — |
| `GET` | `/assignment-conversations/:conversationId/messages` | bearer | 200 | `AssignmentConversationsController.listMessages` | query: cursor, limit, query |
| `POST` | `/assignment-conversations/:conversationId/messages` | bearer | 201 | `AssignmentConversationsController.sendMessage` | idempotency key |

## assignment-calls

Module: `src/modules/assignment-calls/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/admin/communication-capacity` | bearer | 200 | `AssignmentCallsController.getCommunicationCapacity` | — |
| `POST` | `/assignment-calls/:callId/answer` | bearer | 201 | `AssignmentCallsController.answer` | idempotency key |
| `POST` | `/assignment-calls/:callId/decline` | bearer | 201 | `AssignmentCallsController.decline` | idempotency key |
| `POST` | `/assignment-calls/:callId/end` | bearer | 201 | `AssignmentCallsController.end` | idempotency key |
| `GET` | `/assignment-calls/:callId/join-credentials` | bearer | 200 | `AssignmentCallsController.getJoinCredentials` | — |
| `POST` | `/assignment-calls/:callId/reconnect` | bearer | 201 | `AssignmentCallsController.reconnect` | idempotency key |
| `POST` | `/assignment-conversations/:conversationId/calls` | bearer | 201 | `AssignmentCallsController.start` | idempotency key |

## Chat Attachments

Module: `src/modules/chat-attachments/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/assignment-conversations/:conversationId/attachment-uploads` | bearer | 201 | `ChatAttachmentsController.createUpload` | idempotency key · multipart |
| `POST` | `/assignment-conversations/:conversationId/attachments/:attachmentId/download-url` | bearer | 201 | `ChatAttachmentsController.createDownloadUrl` | — |
| `GET` | `/chat-attachment-upload-constraints` | bearer | 200 | `ChatAttachmentsController.getUploadConstraints` | — |

## Contribution Proposals

Module: `src/modules/contribution-proposals/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/contribution-proposals` | bearer | 201 | `ContributionProposalsController.submit` | idempotency key |
| `GET` | `/contribution-proposals/:proposalId` | bearer | 200 | `ContributionProposalsController.getForActor` | — |
| `POST` | `/contribution-proposals/:proposalId/accept` | bearer | 200 | `ContributionProposalsController.accept` | idempotency key |
| `POST` | `/contribution-proposals/:proposalId/decline` | bearer | 200 | `ContributionProposalsController.decline` | idempotency key |
| `POST` | `/contribution-proposals/:proposalId/misuse-reports` | bearer | 201 | `ContributionProposalsController.reportMisuse` | idempotency key |
| `POST` | `/contribution-proposals/:proposalId/revision-requests` | bearer | 201 | `ContributionProposalsController.requestRevision` | idempotency key |
| `POST` | `/contribution-proposals/:proposalId/versions` | bearer | 201 | `ContributionProposalsController.submitVersion` | idempotency key |
| `POST` | `/contribution-proposals/:proposalId/withdraw` | bearer | 200 | `ContributionProposalsController.withdraw` | idempotency key |
| `GET` | `/contribution-proposals/for-project/:projectId` | bearer | 200 | `ContributionProposalsController.listForProject` | query: cursor, limit |
| `GET` | `/contribution-proposals/for-project/:projectId/intake` | bearer | 200 | `ContributionProposalsController.getIntake` | — |
| `PUT` | `/contribution-proposals/for-project/:projectId/intake` | bearer | 200 | `ContributionProposalsController.setIntake` | — |
| `GET` | `/contribution-proposals/mine` | bearer | 200 | `ContributionProposalsController.listMine` | query: cursor, limit |

## Contribution Requests

Module: `src/modules/contribution-tasks/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/contribution-requests/:requestId` | bearer | 200 | `ContributionTasksController.getOwnedRequest` | — |
| `PATCH` | `/contribution-requests/:requestId` | bearer | 200 | `ContributionTasksController.updateDraft` | idempotency key |
| `POST` | `/contribution-requests/:requestId/cancel` | bearer | 200 | `ContributionTasksController.cancelRequest` | idempotency key |
| `POST` | `/contribution-requests/:requestId/discard` | bearer | 200 | `ContributionTasksController.discardDraft` | idempotency key |
| `POST` | `/contribution-requests/:requestId/publish` | bearer | 200 | `ContributionTasksController.publishRequest` | idempotency key |
| `GET` | `/contribution-requests/:requestId/skill-requirements` | bearer | 200 | `ContributionTasksController.listSkillRequirements` | — |
| `PUT` | `/contribution-requests/:requestId/skill-requirements` | bearer | 200 | `ContributionTasksController.replaceSkillRequirements` | — |
| `GET` | `/projects/:projectId/contribution-requests` | bearer | 200 | `ContributionTasksController.listForOwnedProject` | — |
| `POST` | `/projects/:projectId/contribution-requests` | bearer | 201 | `ContributionTasksController.createDraft` | idempotency key |
| `GET` | `/tasks` | public | 200 | `PublicContributionRequestsController.list` | query: q, technologies, [technologies[]], difficulty, hasReward |
| `GET` | `/tasks/:requestId` | public | 200 | `PublicContributionRequestsController.getById` | — |

## Contributor Dashboard

Module: `src/modules/dashboard/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/contributors/me/dashboard` | bearer · contributor | 200 | `ContributorDashboardController.get` | — |

## Contributor Profiles

Module: `src/modules/contributor-profiles/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/contributors/experience-levels` | public | 200 | `ContributorExperienceLevelsController.list` | — |
| `GET` | `/contributors/profile-fields` | public | 200 | `ContributorFieldsController.list` | — |
| `GET` | `/contributors/profiles` | bearer | 200 | `ContributorProfilesController.list` | query: q, page, limit |
| `GET` | `/contributors/profiles/:username` | bearer | 200 | `ContributorProfilesController.getByUsername` | — |
| `GET` | `/contributors/profiles/:username/avatar` | public | 200 | `ContributorProfileAvatarsController.getAvatar` | — |
| `PATCH` | `/contributors/profiles/me` | bearer | 200 | `ContributorProfilesController.update` | — |
| `PUT` | `/contributors/profiles/me/avatar` | bearer | 200 | `ContributorProfilesController.updateAvatar` | multipart |
| `POST` | `/contributors/profiles/me/ensure` | bearer | 201 | `ContributorProfilesController.ensure` | — |

## Deliveries & Reviews

Module: `src/modules/delivery-reviews/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/applications/:applicationId/deliveries` | bearer | 201 | `DeliveryReviewsController.submit` | idempotency key |
| `GET` | `/deliveries/:deliveryId` | bearer | 200 | `DeliveryReviewsController.getForActor` | — |
| `PATCH` | `/deliveries/:deliveryId` | bearer | 200 | `DeliveryReviewsController.update` | idempotency key |
| `POST` | `/deliveries/:deliveryId/reviews` | bearer | 201 | `DeliveryReviewsController.review` | idempotency key |
| `GET` | `/me/deliveries` | bearer | 200 | `DeliveryReviewsController.listContributorLifecycle` | — |
| `GET` | `/owner/deliveries` | bearer | 200 | `DeliveryReviewsController.listReviewQueue` | — |
| `GET` | `/owner/delivery-lifecycle` | bearer | 200 | `DeliveryReviewsController.listOwnerLifecycle` | — |

## Eligibility Gate

Module: `src/modules/eligibility/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/tasks/:requestId/eligibility` | bearer · contributor | 200 | `EligibilityController.previewForRequest` | — |

## GitHub Connection

Module: `src/modules/github/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/auth/github/app/callback` | public | 302 | `GitHubAppCallbackController.callback` | query: code, state, error |
| `GET` | `/auth/github/callback/repository` | public | 302 | `GitHubOAuthBrowserCallbackController.redirectRepositoryConnectCallback` | query: code, state, error, error_description |
| `DELETE` | `/github/account` | bearer | 200 | `GitHubOAuthController.disconnect` | — |
| `GET` | `/github/account` | bearer | 200 | `GitHubOAuthController.getAccount` | — |
| `GET` | `/github/app/installations` | bearer | 200 | `GitHubAppController.list` | — |
| `DELETE` | `/github/app/installations/:installationLinkId` | bearer | 200 | `GitHubAppController.disconnect` | — |
| `GET` | `/github/app/installations/attempts/:attemptId` | bearer | 200 | `GitHubAppController.getConnectionAttempt` | — |
| `POST` | `/github/app/installations/callback` | bearer | 201 | `GitHubAppController.complete` | — |
| `POST` | `/github/app/installations/start` | bearer | 201 | `GitHubAppController.start` | — |
| `GET` | `/github/app/repositories` | bearer | 200 | `GitHubAppController.repositories` | query: installationLinkId, page, perPage |
| `GET` | `/github/oauth/callback` | public | 200 | `GitHubOAuthController.callbackFromRedirect` | query: code, state |
| `POST` | `/github/oauth/callback` | public | 201 | `GitHubOAuthController.callbackFromFrontend` | — |
| `GET` | `/github/oauth/start` | bearer | 200 | `GitHubOAuthController.startOAuth` | — |
| `GET` | `/github/readme` | bearer | 200 | `GitHubOAuthController.getReadme` | query: fullName |
| `GET` | `/github/repositories` | bearer | 200 | `GitHubOAuthController.listRepositories` | query: page, perPage |
| `GET` | `/github/repository/commit-signals` | bearer | 200 | `GitHubOAuthController.getCommitSignals` | query: fullName, author |
| `GET` | `/github/repository/contribution-activity` | bearer | 200 | `GitHubOAuthController.getContributionActivity` | query: fullName |
| `GET` | `/github/repository/description` | bearer | 200 | `GitHubOAuthController.getRepositoryDescription` | query: fullName |
| `GET` | `/github/repository/statistics` | bearer | 200 | `GitHubOAuthController.getRepositoryStatistics` | query: fullName |
| `POST` | `/webhooks/github/app` | public | 201 | `GitHubAppWebhookController.receive` | raw body |

## Health

Module: `src/modules/health/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/health` | public | 200 | `HealthController.check` | — |

## Identity, Auth & Session

Module: `src/modules/identity/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/auth/forgot-password` | public | 201 | `ManualAuthController.forgotPassword` | — |
| `DELETE` | `/auth/github/account` | bearer | 200 | `GitHubAuthController.disconnectGitHubAccount` | — |
| `POST` | `/auth/github/account/callback` | bearer | 201 | `GitHubAuthController.completeGitHubAccountConnection` | — |
| `GET` | `/auth/github/callback` | public | 302 | `GitHubAuthController.completeGitHubGet` | — |
| `POST` | `/auth/github/callback` | public | 201 | `GitHubAuthController.completeGitHubPost` | — |
| `GET` | `/auth/github/start` | public | 200 | `GitHubAuthController.startGitHub` | query: role, intent |
| `GET` | `/auth/google/callback` | public | 302 | `GoogleAuthController.completeGoogleGet` | — |
| `POST` | `/auth/google/callback` | public | 201 | `GoogleAuthController.completeGooglePost` | — |
| `GET` | `/auth/google/start` | public | 200 | `GoogleAuthController.startGoogle` | query: role, intent |
| `POST` | `/auth/login` | public | 201 | `ManualAuthController.login` | — |
| `POST` | `/auth/logout` | bearer | 201 | `SessionController.logout` | — |
| `GET` | `/auth/me` | bearer | 200 | `SessionController.me` | — |
| `PATCH` | `/auth/me/details` | bearer | 200 | `SessionController.updateMyDetails` | — |
| `GET` | `/auth/me/export` | bearer | 200 | `SessionController.exportMyAccountData` | — |
| `PUT` | `/auth/me/identity-document` | bearer | 200 | `SessionController.uploadIdentityDocument` | multipart |
| `PATCH` | `/auth/me/password` | bearer | 200 | `SessionController.changeMyPassword` | — |
| `PATCH` | `/auth/me/phone` | bearer | 200 | `SessionController.updateMyPhone` | — |
| `PATCH` | `/auth/me/preferences` | bearer | 200 | `SessionController.updateMyPreferences` | — |
| `PATCH` | `/auth/me/privacy` | bearer | 200 | `SessionController.updateMyPrivacy` | — |
| `PATCH` | `/auth/me/username` | bearer | 200 | `SessionController.updateMyUsername` | — |
| `POST` | `/auth/refresh` | public | 201 | `SessionController.refresh` | — |
| `POST` | `/auth/register` | public | 201 | `ManualAuthController.register` | — |
| `POST` | `/auth/reset-password` | public | 201 | `ManualAuthController.resetPassword` | — |
| `GET` | `/auth/username-availability` | public | 200 | `ManualAuthController.checkUsernameAvailability` | query: username |
| `PATCH` | `/auth/users/:id/role` | bearer · admin | 200 | `SessionController.assignRole` | — |
| `POST` | `/auth/verify-email` | public | 201 | `ManualAuthController.verifyEmail` | — |
| `POST` | `/auth/verify-email/resend` | public | 201 | `ManualAuthController.resendEmailVerification` | — |

## Matching & Recommendations

Module: `src/modules/matching/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/contribution-requests/:requestId/matches/generate` | bearer · owner | 201 | `OwnerContributorMatchingController.generate` | — |
| `GET` | `/contributors/me/recommended-tasks` | bearer · contributor | 200 | `RecommendationsController.list` | — |

## Materials & Material Analysis

Module: `src/modules/materials/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/contribution-requests/:requestId/materials` | bearer | 200 | `MaterialsController.listForContributionRequest` | — |
| `POST` | `/contribution-requests/:requestId/materials` | bearer | 201 | `MaterialsController.createForContributionRequest` | idempotency key · multipart |
| `GET` | `/material-analysis/runs/:runId` | bearer | 200 | `MaterialAnalysisController.getRun` | — |
| `POST` | `/material-analysis/sets/:analysisSetId/runs` | bearer | 201 | `MaterialAnalysisController.startSet` | — |
| `POST` | `/material-analysis/suggestions/:suggestionId/adopt-contribution-request` | bearer | 201 | `MaterialAnalysisController.adoptContributionRequestSuggestion` | idempotency key |
| `POST` | `/material-analysis/suggestions/:suggestionId/adopt-project` | bearer | 201 | `MaterialAnalysisController.adoptProjectSuggestion` | idempotency key |
| `POST` | `/material-analysis/suggestions/:suggestionId/reject` | bearer | 201 | `MaterialAnalysisController.rejectSuggestion` | — |
| `GET` | `/material-downloads` | bearer | 200 | `MaterialsController.download` | query: token |
| `GET` | `/material-upload-constraints` | bearer | 200 | `MaterialsController.getUploadConstraints` | — |
| `GET` | `/materials/:materialId` | bearer | 200 | `MaterialsController.getForReader` | — |
| `POST` | `/materials/:materialId/deletions` | bearer | 201 | `MaterialsController.remove` | idempotency key |
| `GET` | `/materials/:materialId/grants` | bearer | 200 | `MaterialsController.listGrants` | — |
| `POST` | `/materials/:materialId/grants` | bearer | 201 | `MaterialsController.grant` | idempotency key |
| `POST` | `/materials/:materialId/grants/:granteeId/revocations` | bearer | 201 | `MaterialsController.revoke` | idempotency key |
| `POST` | `/materials/:materialId/versions` | bearer | 201 | `MaterialsController.addVersion` | idempotency key · multipart |
| `POST` | `/materials/:materialId/versions/:version/download-token` | bearer | 201 | `MaterialsController.issueDownloadToken` | — |
| `PATCH` | `/materials/:materialId/visibility` | bearer | 200 | `MaterialsController.changeVisibility` | idempotency key |
| `GET` | `/projects/:projectId/material-analysis/constraints` | bearer | 200 | `MaterialAnalysisController.getConstraints` | — |
| `GET` | `/projects/:projectId/material-analysis/sets` | bearer | 200 | `MaterialAnalysisController.listSets` | — |
| `POST` | `/projects/:projectId/material-analysis/sets` | bearer | 201 | `MaterialAnalysisController.createSet` | — |
| `GET` | `/projects/:projectId/materials` | bearer | 200 | `MaterialsController.listForProject` | — |
| `POST` | `/projects/:projectId/materials` | bearer | 201 | `MaterialsController.createForProject` | idempotency key · multipart |

## Notifications

Module: `src/modules/notifications/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/me/notification-preferences` | bearer | 200 | `NotificationsController.getPreferences` | — |
| `PATCH` | `/me/notification-preferences` | bearer | 200 | `NotificationsController.updatePreferences` | — |
| `GET` | `/notifications` | bearer | 200 | `NotificationsController.list` | query: cursor, limit, readState, type |
| `PATCH` | `/notifications/:notificationId/read` | bearer | 200 | `NotificationsController.markReadCompatibility` | — |
| `PATCH` | `/notifications/:notificationId/read-state` | bearer | 200 | `NotificationsController.setReadState` | — |
| `POST` | `/notifications/mark-all-read` | bearer | 200 | `NotificationsController.markAllRead` | — |
| `PATCH` | `/notifications/read-all` | bearer | 200 | `NotificationsController.markAllReadCompatibility` | — |
| `GET` | `/notifications/unread-count` | bearer | 200 | `NotificationsController.unreadCount` | query: cursor, limit, readState, type |

## Payments

Module: `src/modules/payments/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/me/payments/:paymentId` | bearer · owner, contributor | 200 | `PaymentsController.getPaymentStatus` | — |
| `POST` | `/me/subscription/checkout` | bearer · owner, contributor | 201 | `PaymentsController.createCheckout` | idempotency key |
| `POST` | `/payments/paymob/webhook` | public | 200 | `PaymobWebhookController.receive` | raw body · query: hmac |

## Projects

Module: `src/modules/projects/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/projects` | bearer · owner, contributor | 201 | `ProjectsController.createDraft` | idempotency key |
| `GET` | `/projects/categories` | bearer · owner, contributor, admin | 200 | `ProjectsController.listCategories` | — |
| `GET` | `/projects/difficulties` | bearer · owner, contributor, admin | 200 | `ProjectsController.listDifficulties` | — |
| `GET` | `/projects/discover` | bearer · contributor, owner, admin | 200 | `ProjectsController.discoverProjects` | query: page, limit, technologies, category, difficulty, search |
| `POST` | `/projects/github/preview` | bearer · owner, contributor | 200 | `ProjectsController.preview` | — |
| `POST` | `/projects/import/github` | bearer · owner, contributor | 410 | `ProjectsController.importFromGitHub` | — |
| `GET` | `/projects/me` | bearer · owner, contributor | 200 | `ProjectsController.getMyProjects` | query: cursor, limit, status, q |
| `GET` | `/projects/me/:projectId` | bearer · owner, contributor | 200 | `ProjectsController.getOwnerProject` | — |
| `PATCH` | `/projects/me/:projectId` | bearer · owner, contributor | 200 | `ProjectsController.updateOwnerProject` | idempotency key |
| `POST` | `/projects/me/:projectId/archive` | bearer · owner, contributor | 200 | `ProjectsController.archive` | idempotency key |
| `GET` | `/projects/me/:projectId/hero-image` | bearer · owner, contributor | 200 | `ProjectsController.getHeroImage` | — |
| `PUT` | `/projects/me/:projectId/hero-image` | bearer · owner, contributor | 200 | `ProjectsController.uploadHeroImage` | idempotency key · multipart |
| `POST` | `/projects/me/:projectId/publish` | bearer · owner, contributor | 200 | `ProjectsController.publish` | idempotency key |
| `POST` | `/projects/me/:projectId/source/refresh` | bearer · owner, contributor | 200 | `ProjectsController.refreshSource` | idempotency key |
| `GET` | `/public/projects` | public | 200 | `PublicProjectsController.list` | query: cursor, limit, status, q |
| `GET` | `/public/projects/:projectSlug` | public | 200 | `PublicProjectsController.getBySlug` | — |
| `GET` | `/public/projects/:projectSlug/applicants` | public | 200 | `PublicProjectsController.listApplicants` | — |
| `GET` | `/public/projects/:projectSlug/hero-image` | public | 200 | `PublicProjectsController.getHeroImage` | — |
| `DELETE` | `/public/projects/:projectSlug/save` | bearer | 200 | `PublicProjectsController.unsave` | — |
| `GET` | `/public/projects/:projectSlug/save` | bearer | 200 | `PublicProjectsController.getSavedState` | — |
| `POST` | `/public/projects/:projectSlug/save` | bearer | 201 | `PublicProjectsController.save` | — |

## Skill Gap & Eligibility Guidance

Module: `src/modules/skill-guidance/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/contributors/me/eligibility-guidance` | bearer | 200 | `EligibilityGuidanceController.list` | query: cursor, limit |
| `POST` | `/contributors/me/eligibility-guidance` | bearer | 201 | `EligibilityGuidanceController.request` | — |
| `GET` | `/contributors/me/eligibility-guidance/:guidanceId` | bearer | 200 | `EligibilityGuidanceController.get` | — |
| `POST` | `/contributors/me/skill-gap-guidance` | bearer | 201 | `SkillGapGuidanceController.generate` | — |

## Skill Profiles

Module: `src/modules/skill-profiles/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/skill-profiles/me/generations` | bearer | 201 | `SkillProfilesController.startGeneration` | — |
| `GET` | `/skill-profiles/me/generations/:generationId` | bearer | 200 | `SkillProfilesController.getGeneration` | — |
| `POST` | `/skill-profiles/me/generations/:generationId/retry` | bearer | 201 | `SkillProfilesController.retryGeneration` | — |
| `GET` | `/skill-profiles/me/generations/latest` | bearer | 200 | `SkillProfilesController.getLatestGeneration` | — |

## Subscriptions

Module: `src/modules/subscriptions/`

| Method | Path | Auth | Status | Handler | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/me/subscription` | bearer · owner, contributor | 200 | `SubscriptionsController.getCurrentPlan` | — |
| `GET` | `/subscriptions/plans` | public | 200 | `SubscriptionCatalogController.getPlans` | — |

## Not covered by the table above

The shared extractor reads `@Get`/`@Post`/`@Put`/`@Patch`/`@Delete` only, so one streaming route is invisible to it and is listed here by hand:

| Method | Path | Auth | Handler | Notes |
| --- | --- | --- | --- | --- |
| `GET` | `/contributors/me/skill-gap-guidance/stream` | bearer | `SkillGapGuidanceController.stream` | `@Sse` — Server-Sent Events, query: `contributionRequestId` |

## Realtime surface

Not an HTTP route, but part of the same API contract. Namespace `/realtime`, WebSocket transport only, authenticated with the same opaque access token via `auth.token` or an `Authorization: Bearer` header.

| Event | Direction | Payload |
| --- | --- | --- |
| `notification.created` | server → client | `RealtimeEventEnvelope` v1, room `user:<id>` |
| `notification.read_state_changed` | server → client | `RealtimeEventEnvelope` v1, room `user:<id>` |
| `conversation.message.created` | server → client | `RealtimeEventEnvelope` v1, room `user:<id>` |
| `realtime.error` | server → client | `REALTIME_UNAUTHORIZED`, emitted before disconnect |

