# Share-k Backend Postman API Guide

This guide and the collection are generated from the NestJS controllers and validated DTO-backed requests. The canonical local base URL is `http://localhost:4000`; backend routes are deliberately unprefixed.

## Import and local validation

Import `postman/sharek-backend.postman_collection.json` and `postman/sharek-backend.postman_environment.json`, select the environment, and fill only the credentials needed for your local test accounts. Committed email values use the reserved `.test` domain; passwords, tokens, OAuth values, and webhook signatures are empty.

Run the deterministic offline coverage gate from `server/`:

```bash
npm run test:postman
```

The gate discovers every file under `src` containing `@Controller`, compares normalized method/path pairs, rejects duplicates and obsolete routes, validates URL/base-variable use, compiles Postman scripts, and verifies environment/credential safety. It does not start NestJS or contact PostgreSQL, Redis, GitHub, email, AI, or Postman.

## Recommended workflow

1. Start with Health, registration, email verification, and login.
2. Save role-specific bearer tokens (`ownerAccessToken`, `contributorAccessToken`, `adminAccessToken`). The auth test scripts populate them from the confirmed response role.
3. Use GitHub App/provider callback requests only after external setup; placeholders are intentionally nonfunctional.
4. Create a Project, Contribution Request, Application, Proposal, Material, and Analysis Set in dependency order so response scripts capture the IDs used downstream.
5. Multipart requests require selecting a local file in Postman; the collection never commits a local path.

## Complete HTTP endpoint catalog

Unique controller method/path pairs: **156**. WebSocket events are excluded from this HTTP count.

### Health

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `GET` | `/health` | Public | 200 | Health Check |

### Identity and Sessions

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `PATCH` | `/auth/users/:id/role` | admin | 200 | Assign Role |
| `GET` | `/auth/username-availability` | Public | 200 | Check Username Availability |
| `POST` | `/auth/forgot-password` | Public | 201 | Forgot Password |
| `GET` | `/auth/me` | Bearer / resource-scoped | 200 | Get Current User |
| `POST` | `/auth/login` | Public | 201 | Login |
| `POST` | `/auth/logout` | Bearer / resource-scoped | 201 | Logout |
| `POST` | `/auth/refresh` | Public | 201 | Refresh Token |
| `POST` | `/auth/register` | Public | 201 | Register Account |
| `POST` | `/auth/verify-email/resend` | Public | 201 | Resend Email Verification |
| `POST` | `/auth/reset-password` | Public | 201 | Reset Password |
| `PATCH` | `/auth/me/preferences` | Bearer / resource-scoped | 200 | Update Current User Language |
| `POST` | `/auth/verify-email` | Public | 201 | Verify Email |

### OAuth

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `GET` | `/auth/github/app/callback` | Public | 302 | Browser Callback |
| `POST` | `/auth/github/callback` | Public | 201 | Complete GitHub Social Sign-In |
| `POST` | `/auth/github/account/callback` | Bearer / resource-scoped | 201 | Connect GitHub Sign-In Account |
| `DELETE` | `/auth/github/account` | Bearer / resource-scoped | 200 | Disconnect GitHub Sign-In Account |
| `GET` | `/auth/github/callback/repository` | Public | 302 | GitHub Repository OAuth Browser Callback |
| `GET` | `/auth/github/callback` | Public | 302 | GitHub Social Browser Callback |
| `POST` | `/auth/google/callback` | Public | 201 | Google OAuth Callback from Frontend |
| `GET` | `/auth/google/callback` | Public | 302 | Google OAuth Callback Redirect |
| `GET` | `/auth/github/start` | Public | 200 | Start GitHub Social Sign-In |
| `GET` | `/auth/google/start` | Public | 200 | Start Google OAuth |

### GitHub Evidence

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `DELETE` | `/github/account` | Bearer / resource-scoped | 200 | Disconnect GitHub Account |
| `GET` | `/github/repository/commit-signals` | Bearer / resource-scoped | 200 | Get Commit Signals |
| `GET` | `/github/account` | Bearer / resource-scoped | 200 | Get Connected GitHub Account |
| `GET` | `/github/repository/contribution-activity` | Bearer / resource-scoped | 200 | Get Contribution Activity |
| `GET` | `/github/repository/description` | Bearer / resource-scoped | 200 | Get Repository Description |
| `GET` | `/github/readme` | Bearer / resource-scoped | 200 | Get Repository README |
| `GET` | `/github/repository/statistics` | Bearer / resource-scoped | 200 | Get Repository Statistics |
| `POST` | `/github/oauth/callback` | Public | 201 | GitHub OAuth Callback from Frontend |
| `GET` | `/github/oauth/callback` | Public | 200 | GitHub OAuth Callback Redirect |
| `GET` | `/github/repositories` | Bearer / resource-scoped | 200 | List GitHub Repositories |
| `GET` | `/github/oauth/start` | Bearer / resource-scoped | 200 | Start GitHub OAuth |

### GitHub App

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `POST` | `/github/app/installations/callback` | Bearer / resource-scoped | 201 | Complete Installation |
| `DELETE` | `/github/app/installations/:installationLinkId` | Bearer / resource-scoped | 200 | Disconnect Installation |
| `GET` | `/github/app/installations/attempts/:attemptId` | Bearer / resource-scoped | 200 | Get Installation Attempt |
| `POST` | `/webhooks/github/app` | Public | 201 | GitHub App Webhook |
| `GET` | `/github/app/installations` | Bearer / resource-scoped | 200 | List Installations |
| `GET` | `/github/app/repositories` | Bearer / resource-scoped | 200 | List Selected Repositories |
| `POST` | `/github/app/installations/start` | Bearer / resource-scoped | 201 | Start Installation |

### Projects

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `POST` | `/projects/me/:projectId/archive` | owner / contributor | 200 | Archive Project |
| `POST` | `/projects` | owner / contributor | 201 | Create Project Draft |
| `GET` | `/projects/discover` | contributor / owner / admin | 200 | Discover Published Projects |
| `GET` | `/projects/me/:projectId` | owner / contributor | 200 | Get My Project |
| `GET` | `/public/projects/:projectSlug` | Public | 200 | Get Public Project |
| `GET` | `/projects/me` | owner / contributor | 200 | List My Projects |
| `GET` | `/public/projects` | Public | 200 | List Public Projects |
| `POST` | `/projects/github/preview` | owner / contributor | 200 | Preview GitHub Source |
| `POST` | `/projects/me/:projectId/publish` | owner / contributor | 200 | Publish Project |
| `POST` | `/projects/me/:projectId/source/refresh` | owner / contributor | 200 | Refresh Project Source |
| `POST` | `/projects/import/github` | owner / contributor | 410 | Retired GitHub Import Compatibility Route |
| `PATCH` | `/projects/me/:projectId` | owner / contributor | 200 | Update My Project |

### Contribution Requests

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `POST` | `/contribution-requests/:requestId/cancel` | Bearer / resource-scoped | 200 | Cancel Published Request |
| `POST` | `/projects/:projectId/contribution-requests` | Bearer / resource-scoped | 201 | Create Draft |
| `POST` | `/contribution-requests/:requestId/discard` | Bearer / resource-scoped | 200 | Discard Draft |
| `GET` | `/tasks` | Public | 200 | Discover Open Requests |
| `GET` | `/contribution-requests/:requestId` | Bearer / resource-scoped | 200 | Get Owned Request |
| `GET` | `/tasks/:requestId` | Public | 200 | Get Public Request Detail |
| `GET` | `/projects/:projectId/contribution-requests` | Bearer / resource-scoped | 200 | List Owned Project Requests by Status |
| `GET` | `/contribution-requests/:requestId/skill-requirements` | Bearer / resource-scoped | 200 | List Skill Requirements |
| `GET` | `/tasks/:requestId/eligibility` | contributor | 200 | Preview For Request |
| `POST` | `/contribution-requests/:requestId/publish` | Bearer / resource-scoped | 200 | Publish Request |
| `PUT` | `/contribution-requests/:requestId/skill-requirements` | Bearer / resource-scoped | 200 | Replace Skill Requirements |
| `PATCH` | `/contribution-requests/:requestId` | Bearer / resource-scoped | 200 | Update Draft |

### Applications

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `POST` | `/applications/:applicationId/accept` | Bearer / resource-scoped | 200 | Accept Application |
| `POST` | `/applications/:applicationId/decline` | Bearer / resource-scoped | 200 | Decline Application with Feedback |
| `GET` | `/applications/:applicationId` | Bearer / resource-scoped | 200 | Get Application as Owner |
| `GET` | `/tasks/:requestId/applications` | Bearer / resource-scoped | 200 | List Request Applications as Owner |
| `GET` | `/applications/:applicationId/assessment` | Bearer / resource-scoped | 200 | Read Advisory Fit Assessment |
| `POST` | `/applications/:applicationId/assessment/presentations` | Bearer / resource-scoped | 200 | Record Advisory Fit Presentation |
| `POST` | `/owner-decisions/:ownerDecisionId/reports` | Bearer / resource-scoped | 201 | Report Decline Feedback |
| `POST` | `/applications/:applicationId/assessment-requests` | Bearer / resource-scoped | 202 | Request Advisory Fit Assessment |
| `POST` | `/tasks/:requestId/applications` | Bearer / resource-scoped | 201 | Submit Application |
| `POST` | `/applications/:applicationId/withdraw` | Bearer / resource-scoped | 200 | Withdraw Application |

### Delivery Reviews

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `GET` | `/deliveries/:deliveryId` | Bearer / resource-scoped | 200 | Get For Actor |
| `GET` | `/me/deliveries` | Bearer / resource-scoped | 200 | List Contributor Lifecycle |
| `GET` | `/owner/delivery-lifecycle` | Bearer / resource-scoped | 200 | List Owner Lifecycle |
| `GET` | `/owner/deliveries` | Bearer / resource-scoped | 200 | List Review Queue |
| `POST` | `/deliveries/:deliveryId/reviews` | Bearer / resource-scoped | 201 | Review |
| `POST` | `/applications/:applicationId/deliveries` | Bearer / resource-scoped | 201 | Submit |
| `PATCH` | `/deliveries/:deliveryId` | Bearer / resource-scoped | 200 | Update |

### Contribution Proposals

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `POST` | `/contribution-proposals/:proposalId/accept` | Bearer / resource-scoped | 200 | Accept Proposal |
| `POST` | `/contribution-proposals/:proposalId/decline` | Bearer / resource-scoped | 200 | Decline Proposal |
| `GET` | `/contribution-proposals/:proposalId` | Bearer / resource-scoped | 200 | Get Proposal Detail |
| `GET` | `/contribution-proposals/mine` | Bearer / resource-scoped | 200 | List My Proposals |
| `GET` | `/contribution-proposals/for-project/:projectId` | Bearer / resource-scoped | 200 | List Project Proposals |
| `GET` | `/contribution-proposals/for-project/:projectId/intake` | Bearer / resource-scoped | 200 | Read Project Intake |
| `POST` | `/contribution-proposals/:proposalId/misuse-reports` | Bearer / resource-scoped | 201 | Report Proposal Misuse |
| `POST` | `/contribution-proposals/:proposalId/revision-requests` | Bearer / resource-scoped | 201 | Request Revision |
| `POST` | `/contribution-proposals` | Bearer / resource-scoped | 201 | Submit Proposal |
| `POST` | `/contribution-proposals/:proposalId/versions` | Bearer / resource-scoped | 201 | Submit Revised Version |
| `PUT` | `/contribution-proposals/for-project/:projectId/intake` | Bearer / resource-scoped | 200 | Toggle Project Intake |
| `POST` | `/contribution-proposals/:proposalId/withdraw` | Bearer / resource-scoped | 200 | Withdraw Proposal |

### Materials

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `POST` | `/materials/:materialId/versions` | Bearer / resource-scoped | 201 | Append a Material Version |
| `PATCH` | `/materials/:materialId/visibility` | Bearer / resource-scoped | 200 | Change Material visibility |
| `POST` | `/materials/:materialId/deletions` | Bearer / resource-scoped | 201 | Delete a Material |
| `POST` | `/materials/:materialId/grants` | Bearer / resource-scoped | 201 | Grant a contributor access |
| `POST` | `/materials/:materialId/versions/:version/download-token` | Bearer / resource-scoped | 201 | Issue a download link |
| `GET` | `/contribution-requests/:requestId/materials` | Bearer / resource-scoped | 200 | List Contribution Request Materials |
| `GET` | `/materials/:materialId/grants` | Bearer / resource-scoped | 200 | List Material grants |
| `GET` | `/projects/:projectId/materials` | Bearer / resource-scoped | 200 | List Project Materials |
| `GET` | `/materials/:materialId` | Bearer / resource-scoped | 200 | Read an owned Material |
| `GET` | `/material-upload-constraints` | Bearer / resource-scoped | 200 | Read upload constraints |
| `GET` | `/material-downloads` | Bearer / resource-scoped | 200 | Redeem a download link |
| `POST` | `/materials/:materialId/grants/:granteeId/revocations` | Bearer / resource-scoped | 201 | Revoke a grant |
| `POST` | `/contribution-requests/:requestId/materials` | Bearer / resource-scoped | 201 | Upload a Contribution Request Material |
| `POST` | `/projects/:projectId/materials` | Bearer / resource-scoped | 201 | Upload a Project Material |

### Material Analysis

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `POST` | `/material-analysis/suggestions/:suggestionId/adopt-contribution-request` | Bearer / resource-scoped | 201 | Adopt Material Analysis Contribution Request Suggestion |
| `POST` | `/material-analysis/suggestions/:suggestionId/adopt-project` | Bearer / resource-scoped | 201 | Adopt Material Analysis Project Suggestion |
| `POST` | `/projects/:projectId/material-analysis/sets` | Bearer / resource-scoped | 201 | Create Material Analysis Set |
| `GET` | `/projects/:projectId/material-analysis/constraints` | Bearer / resource-scoped | 200 | Get Material Analysis Constraints |
| `GET` | `/material-analysis/runs/:runId` | Bearer / resource-scoped | 200 | Get Material Analysis Run |
| `GET` | `/projects/:projectId/material-analysis/sets` | Bearer / resource-scoped | 200 | List Material Analysis Sets |
| `POST` | `/material-analysis/suggestions/:suggestionId/reject` | Bearer / resource-scoped | 201 | Reject Material Analysis Suggestion |
| `POST` | `/material-analysis/sets/:analysisSetId/runs` | Bearer / resource-scoped | 201 | Start Material Analysis Set Run |

### Contributor Profiles

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `POST` | `/contributors/profiles/me/ensure` | Bearer / resource-scoped | 201 | Ensure My Profile |
| `POST` | `/contributors/me/skill-gap-guidance` | Bearer / resource-scoped | 201 | Generate |
| `GET` | `/contributors/profiles/:username/avatar` | Public | 200 | Get Contributor Avatar |
| `GET` | `/contributors/profiles/:username` | Bearer / resource-scoped | 200 | Get Contributor Profile |
| `GET` | `/contributors/me/recommended-tasks` | contributor | 200 | List |
| `GET` | `/contributors/profile-fields` | Bearer / resource-scoped | 200 | List Contributor Fields |
| `GET` | `/contributors/experience-levels` | Public | 200 | List Experience Levels |
| `PATCH` | `/contributors/profiles/me` | Bearer / resource-scoped | 200 | Update My Profile |
| `PUT` | `/contributors/profiles/me/avatar` | Bearer / resource-scoped | 200 | Upload My Avatar |

### Skill Profiles

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `GET` | `/skill-profiles/me/generations/:generationId` | Bearer / resource-scoped | 200 | Get Generation |
| `GET` | `/skill-profiles/me/generations/latest` | Bearer / resource-scoped | 200 | Get Latest Generation |
| `POST` | `/skill-profiles/me/generations/:generationId/retry` | Bearer / resource-scoped | 201 | Retry Generation |
| `POST` | `/skill-profiles/me/generations` | Bearer / resource-scoped | 201 | Start Generation |

### Assignment Conversations

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `GET` | `/assignment-conversations/:conversationId` | Bearer / resource-scoped | 200 | Get Assignment Conversation |
| `GET` | `/assignment-conversations` | Bearer / resource-scoped | 200 | List Assignment Conversations |
| `GET` | `/assignment-conversations/:conversationId/messages` | Bearer / resource-scoped | 200 | List Assignment Messages |
| `POST` | `/assignment-conversations/:conversationId/messages` | Bearer / resource-scoped | 201 | Send Assignment Message |

### Notifications

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `GET` | `/me/notification-preferences` | Bearer / resource-scoped | 200 | Get Notification Preferences |
| `GET` | `/notifications` | Bearer / resource-scoped | 200 | List Notifications |
| `POST` | `/notifications/mark-all-read` | Bearer / resource-scoped | 200 | Mark All Notifications Read |
| `PATCH` | `/notifications/read-all` | Bearer / resource-scoped | 200 | Mark All Read Compatibility |
| `PATCH` | `/notifications/:notificationId/read` | Bearer / resource-scoped | 200 | Mark Read Compatibility |
| `PATCH` | `/notifications/:notificationId/read-state` | Bearer / resource-scoped | 200 | Set Notification Read State |
| `GET` | `/notifications/unread-count` | Bearer / resource-scoped | 200 | Unread Notification Count |
| `PATCH` | `/me/notification-preferences` | Bearer / resource-scoped | 200 | Update Notification Preferences |

### Subscriptions

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `POST` | `/me/subscription/checkout` | owner / contributor | 201 | Create Checkout |
| `GET` | `/me/subscription` | owner / contributor | 200 | Get Current Plan |
| `GET` | `/me/payments/:paymentId` | owner / contributor | 200 | Get Payment Status |
| `GET` | `/subscriptions/plans` | Public | 200 | Get Plans |

### Admin

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | ---: | --- |
| `PATCH` | `/admin/skill-reviews/:skillProfileId/proficiency` | admin | 200 | Adjust Skill Proficiency |
| `POST` | `/admin/skill-reviews/:skillProfileId/approve` | admin | 200 | Approve Skill |
| `POST` | `/admin/contributor-fields` | admin | 201 | Create Contributor Field |
| `POST` | `/admin/experience-levels` | admin | 201 | Create Experience Level |
| `GET` | `/admin/contributor-fields` | admin | 200 | List Contributor Fields |
| `GET` | `/admin/experience-levels` | admin | 200 | List Experience Levels |
| `GET` | `/admin/skill-reviews/pending` | admin | 200 | List Pending Skill Reviews |
| `GET` | `/admin/published-project-owners` | admin | 200 | List Published Project Owners |
| `POST` | `/admin/skill-reviews/:skillProfileId/reject` | admin | 200 | Reject Skill |
| `PATCH` | `/admin/contributor-fields/:fieldId` | admin | 200 | Update Contributor Field |
| `PATCH` | `/admin/experience-levels/:levelId` | admin | 200 | Update Experience Level |

## Realtime events (not HTTP endpoints)

- Socket.IO namespace: `/realtime` with bearer authentication in `auth.token`.
- Notification events: `notification.created`, `notification.read_state_changed`.
- Assignment conversation event: `conversation.message.created`.
- PostgreSQL HTTP reads remain authoritative; clients deduplicate stable event IDs and reconcile gaps through the HTTP endpoints above.

## Explicit Postman upload

Local validation is the default and never uploads. To update an existing Postman workspace, set `POSTMAN_API_KEY`, `POSTMAN_COLLECTION_ID`, and optionally `POSTMAN_ENVIRONMENT_ID`, then run:

```bash
npm run postman:upload
```

The command refuses upload without the explicit `--upload` operation and environment variables. No API key is read from repository or developer-specific files.
