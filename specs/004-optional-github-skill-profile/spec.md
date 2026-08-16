# Feature Specification: Optional GitHub Skill Profiling

**Feature Branch**: `main (current branch; no branch change authorized)`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Separate registration from GitHub skill profiling. Users open their normal profile after registration and may optionally connect GitHub. Repository access must use a GitHub App rather than the current broad repository OAuth grant. Contributors explicitly select repositories and start skill generation from their profile."

**Traceability**: PRD FR-011 through FR-014, FR-027 through FR-033, FR-083, FR-084, FR-088, FR-090, FR-094; backlog TASK-1-04, TASK-1-05, TASK-3-02 through TASK-3-04; Constitution v3.1.0; ADR-002

## Source Classification *(mandatory for brownfield features)*

- **Current behavior**: Registration and profile APIs already exist. GitHub social sign-in is separated from authenticated repository connection. The repository connection currently stores a broad OAuth repository token. Contributors can select up to ten accessible repositories, consent to analysis, start durable skill generation, poll generation status, and submit generated skills for admin review.
- **Approved target behavior**: Registration and normal profile use remain independent of repository analysis. Repository evidence comes only from repositories selected in a verified, active Share-k GitHub App installation authorized by the same immutable GitHub account linked to the Share-k user. Installation does not start analysis. The contributor explicitly selects repositories, consents, and starts generation from the profile. Generated skills remain pending until admin review.
- **Assumptions**: Existing registration, profile editing, skill-generation, evidence, queue, AI, and admin-review behavior will be adapted rather than rebuilt. Optional GitHub social sign-in may remain identity-only.
- **Unresolved decisions**: No product ambiguity remains after the clarification sessions below. Planning must still validate provider permissions, token handling, webhook behavior, public DTO projection, and migration mechanics against current code and official provider contracts.

## Clarifications

### Session 2026-07-26

- Q: What may a verified contributor do before skill approval? → A: Keep the email-verified contributor account active, allow normal profile management and project browsing, and block only skill-gated applications until relevant skills are approved.
- Q: How many GitHub App installations may a Share-k user link? → A: A user may link multiple personal or organization installations, each with independent repository selection and lifecycle state.
- Q: What happens to historical private OAuth evidence during migration? → A: Preserve approved skills, admin decisions, and minimal safe audit attribution; at production cutover stop legacy evidence reuse and revoke/purge broad repository OAuth credentials; retain raw private evidence as non-reusable for 30 days, then redact/purge it; unresolved legacy candidates then become `needs_more_evidence`.
- Q: Does disconnecting from Share-k also uninstall the GitHub App? → A: No. Local disconnect immediately disables that Share-k installation link and repository reads while preserving identity login; GitHub uninstall is a separate provider-managed action linked from Share-k.
- Q: How does a contributor retry failed or insufficient-evidence analysis? → A: Prefill the previous repository selection, require another explicit start and consent confirmation, revalidate current access, and create a new generation without reconnecting a still-valid installation.

### Session 2026-07-27

- Q: May one organization GitHub App installation be linked by multiple Share-k users? → A: Yes. Multiple Share-k users may link the same organization installation after GitHub independently verifies each user's current access; repository selection, consent, generations, and local disconnect remain user-specific.
- Q: Does email verification activate a contributor account, or does the account remain pending until skill approval? → A: Email verification activates the account; approved skills separately control skill-gated applications, while generated skills remain pending for admin review.
- Q: How does Share-k prove an organization member's current access after the initial GitHub App callback? → A: Store encrypted, expiring GitHub App user and refresh tokens on that user's installation link, rotate them, and use them only for current member-access verification; repository evidence reads continue to use short-lived installation tokens.
- Q: Which GitHub-supported redirect flow completes installation and member authorization? → A: Request GitHub App user authorization during installation, carry Share-k's user-bound state on the installation URL, and complete through the configured OAuth callback without a setup URL; additional members linking an existing organization installation use the normal GitHub App web authorization flow.
- Q: When are legacy broad repository credentials and raw private evidence removed? → A: Revoke and purge broad repository credentials at production cutover; keep raw private evidence non-reusable for 30 days, then redact or purge it while preserving approved skills, admin decisions, and minimal public-safe audit attribution.
- Q: Who may see private repository identifiers and evidence details? → A: Contributors may view details for their own generations, admins receive a bounded review DTO, and all other profile/project/discovery/retrieval responses expose only approved skill fields and public-safe attribution without private repository identifiers.

### Session 2026-08-16

- Q: May repository authorization use a different GitHub user from the one linked to Sharek sign-in? → A: No. Repository consent remains a separate OAuth/GitHub App operation, but its immutable GitHub user ID must match the GitHub identity linked to the authenticated Sharek user. That same account may select its personal repositories and organization repositories it can currently access.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register Without GitHub (Priority: P1)

A new user registers, verifies their email, and enters their normal profile or dashboard without being required to connect GitHub or complete a combined onboarding screen.

**Why this priority**: It establishes the product boundary that GitHub is optional and prevents an external provider from blocking account creation or ordinary profile use.

**Independent Test**: Register and verify a contributor while GitHub is unavailable, then confirm the contributor can open and edit their profile and browse available projects.

**Acceptance Scenarios**:

1. **Given** a visitor has valid registration information, **When** they register and verify their email, **Then** they reach their normal authenticated experience without a mandatory GitHub redirect.
2. **Given** a verified contributor without GitHub, **When** they open their profile, **Then** the profile is usable and shows GitHub skill analysis as an optional action.
3. **Given** an active verified contributor without approved skills, **When** they manage their profile or browse projects, **Then** those actions remain available while skill-gated applications clearly explain the missing verified-skill requirement.

---

### User Story 2 - Install GitHub App and Select Repositories (Priority: P1)

An authenticated contributor chooses to connect GitHub from their profile, installs the Share-k GitHub App, grants read-only access to selected repositories, and returns to a verified connection state.

**Why this priority**: Fine-grained, explicit repository authorization is the security boundary for all later evidence collection.

**Independent Test**: Install the app for one test repository, return to Share-k, and confirm that only repositories authorized by the verified installation can be offered for analysis.

**Acceptance Scenarios**:

1. **Given** a contributor without a GitHub installation, **When** they choose Connect GitHub, **Then** Share-k creates a single-use user-bound state and sends them through GitHub's install-and-authorize flow, where they see the repository permissions and choose which repositories to grant.
2. **Given** GitHub returns an authorization code and state to the configured callback, **When** Share-k completes the flow, **Then** Share-k validates the state and independently verifies the authenticated contributor's current access before storing or displaying the installation link.
3. **Given** an installation grants access to selected repositories, **When** the contributor views the repository picker, **Then** no unselected private repository is exposed.
4. **Given** the contributor cancels installation, **When** they return to Share-k, **Then** their existing profile remains usable and they can retry later.
5. **Given** a contributor already has a linked installation, **When** they link another personal or organization installation, **Then** both remain independently visible and manageable.
6. **Given** an organization installation is already linked by one Share-k user, **When** another organization member completes the normal GitHub App user-authorization flow and independently proves current access, **Then** that member may create their own link without receiving the first user's repository selections, consent, generations, or skills.
7. **Given** a contributor starts repository authorization with a different GitHub account from the identity linked to Sharek, **When** the callback resolves that immutable provider ID, **Then** Sharek rejects the attempt before listing installations or storing member credentials.

---

### User Story 3 - Explicitly Generate a Skill Profile (Priority: P1)

A contributor chooses repositories from the verified installation, reviews an analysis-consent notice, explicitly starts analysis, and sees generation progress and evidence-linked results in their profile.

**Why this priority**: It delivers the Feature 1 skill-profile value while preventing installation or account linkage from being mistaken for consent to analyze code.

**Independent Test**: Select one authorized repository, grant consent, start generation, and confirm that a durable status and evidence-linked pending skill result are shown.

**Acceptance Scenarios**:

1. **Given** an active installation, **When** the contributor merely returns from GitHub, **Then** no skill analysis starts automatically.
2. **Given** an active installation and selected repositories, **When** the contributor has not granted analysis consent, **Then** generation cannot start.
3. **Given** valid selection and consent, **When** the contributor starts generation, **Then** only currently authorized repository evidence is analyzed.
4. **Given** generation succeeds, **When** results are shown, **Then** every generated skill includes proficiency, confidence, evidence attribution, and pending-review status.
5. **Given** evidence is insufficient or processing fails, **When** generation ends, **Then** the contributor sees a safe, actionable status without unsupported skills being approved.
6. **Given** a failed or insufficient-evidence generation whose installation remains valid, **When** the contributor retries, **Then** the previous selection is prefilled, consent is reconfirmed, access is revalidated, and a new generation is created without reconnecting GitHub.
7. **Given** a contributor views their own generation, **When** repository evidence is available, **Then** they may view their own selected repository identifiers and bounded evidence details without exposing credentials or raw provider payloads.

---

### User Story 4 - Review and Revoke Access (Priority: P2)

A contributor can inspect their GitHub connection, change repository access through GitHub, or disconnect it without losing their Share-k profile. Admins continue reviewing generated skills before they qualify the contributor.

**Why this priority**: Revocation and human review complete the privacy and trust lifecycle after the primary generation flow works.

**Independent Test**: Remove a repository from the installation, verify it cannot be used by a new generation, disconnect the installation, and confirm the Share-k account remains accessible through another login method.

**Acceptance Scenarios**:

1. **Given** repository access was removed, **When** a later analysis is requested, **Then** the removed repository is rejected and its private evidence is not reused.
2. **Given** a contributor disconnects an installation from Share-k, **When** they return to their profile, **Then** that local installation link and all Share-k reads through it are disabled, unrelated profile and identity-login data remain available, and the user can follow a separate link to manage or uninstall the app in GitHub.
3. **Given** generated skills are pending, **When** an admin approves, rejects, or adjusts them, **Then** only approved skills can satisfy later skill requirements.
4. **Given** an admin reviews a generated skill, **When** evidence is displayed, **Then** the admin receives only the bounded private evidence required for review through an explicit admin DTO.
5. **Given** another user or a public/discovery consumer views an approved skill, **When** the skill is returned, **Then** the response contains only approved skill fields and non-identifying public-safe attribution.

### Edge Cases

- The installation reference is missing, spoofed, or the authenticated GitHub user cannot currently access it; an existing link by another authorized organization member is not by itself a conflict.
- The GitHub App callback or an existing installation link resolves to a different immutable GitHub user ID from the contributor's linked sign-in identity; Sharek rejects it before repository access.
- The install-and-authorize callback contains a missing, expired, consumed, or user-mismatched state; Share-k rejects it without creating a link and offers a safe restart.
- An organization owner must approve an installation request before repositories become available.
- The user installs the app for no repositories or later removes all repositories.
- Selected repositories become private, are renamed, transferred, deleted, archived, or removed from the installation between selection and processing.
- GitHub is unavailable, rate-limited, or returns incomplete repository evidence.
- The contributor starts duplicate or overlapping generation requests.
- The installation is suspended or deleted while a generation is queued or running.
- A passwordless GitHub-sign-in user attempts a disconnect that would remove their only authentication method.
- Historical evidence was collected through the superseded broad OAuth grant.
- A legacy OAuth-generated skill is still pending when the 30-day migration window expires.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Registration and email verification MUST work without GitHub; successful email verification MUST activate the contributor account so the contributor can manage their normal profile and browse projects.
- **FR-002**: The product MUST present GitHub repository connection as an optional action within the authenticated profile experience, not as a mandatory registration or single-screen onboarding step.
- **FR-003**: GitHub sign-in identity MUST remain logically separate from consent to read repository evidence, while both operations MUST resolve to the same immutable GitHub user ID.
- **FR-004**: Repository evidence access MUST require a verified, active Share-k GitHub App installation.
- **FR-005**: Contributors MUST be able to limit the installation to explicitly selected repositories using read-only permissions.
- **FR-006**: Share-k MUST independently verify that the GitHub App user matches the authenticated contributor's linked immutable GitHub identity and that this user currently accesses the installation and repositories; a client-supplied installation or repository identifier MUST NOT be trusted by itself.
- **FR-007**: Installing or authorizing GitHub MUST NOT automatically start repository ingestion or skill generation.
- **FR-008**: Before generation, contributors MUST explicitly select one or more currently authorized repositories and grant analysis consent.
- **FR-009**: Contributors MUST explicitly start each skill-generation request.
- **FR-010**: The system MUST revalidate both the contributor's current provider access and repository accessibility before collecting evidence for a generation.
- **FR-011**: Each generated skill MUST contain a name, proficiency level, confidence, evidence attribution, and review status.
- **FR-012**: Generated skills MUST remain pending and unavailable for skill-gated applications until admin approval; skill-review state MUST remain separate from account activation and MUST NOT block normal profile management or project browsing.
- **FR-013**: The contributor MUST be able to view installation, selection, generation, failure, insufficient-evidence, and review states from the normal profile experience, including bounded repository/evidence details for only their own generations.
- **FR-014**: The contributor MUST be able to retry a failed or insufficient-evidence generation without reconnecting valid GitHub access; retry MUST prefill the prior repository selection, require a new explicit start and consent confirmation, revalidate current access, and create a new generation.
- **FR-015**: Removing repository access, suspending an installation, or uninstalling the app MUST prevent new reads of affected private evidence.
- **FR-016**: Disconnecting an installation from Share-k MUST immediately disable the local installation link and further Share-k repository reads without deleting identity-only GitHub login or unrelated profile capabilities; uninstalling the GitHub App remains a separate GitHub-managed action.
- **FR-017**: At production cutover, migration MUST stop using and revoke/purge broad repository OAuth credentials without deleting or silently breaking separate Share-k social-identity links.
- **FR-018**: Duplicate callbacks, webhook deliveries, and generation requests MUST be handled idempotently.
- **FR-019**: A Share-k user MUST be able to link multiple installations available to the same linked GitHub identity, including its personal and organization installations. One organization installation MAY be linked by multiple Share-k users only when each user has a distinct matching GitHub identity with independently verified current access; each user's repository choices for analysis, consent, generations, skills, and local disconnect MUST remain isolated.
- **FR-020**: At GitHub App production cutover, the system MUST stop reusing legacy private OAuth evidence for new analysis and classify retained raw private evidence as non-authorizing and non-reusable; 30 days later it MUST redact or purge that raw private evidence while preserving approved skills, admin decisions, and minimal public-safe audit attribution.
- **FR-021**: Legacy skill candidates still unresolved when the 30-day migration window expires MUST transition to `needs_more_evidence` and MUST NOT become approved without newly authorized evidence.

### Trust, Safety, and Audit Requirements

- **TS-001**: The system MUST derive Share-k user identity from the authenticated session and MUST NOT accept client-supplied user or Admin identity as authorization evidence.
- **TS-002**: Installation, repository selection, consent, generation, and revocation states MUST be explicit and auditable.
- **TS-003**: Evidence MUST preserve repository identity, installation selection, visibility, freshness, provenance, confidence, uncertainty, and redaction metadata.
- **TS-004**: Private repository names, URLs, content, and identifying derived evidence MUST be limited to the owning contributor's generation DTO, a bounded admin-review DTO, and the authorized skill-profiling AI request; they MUST NOT enter other-user/public profiles, public projects, discovery/retrieval paths, logs, unrelated AI requests/responses, or public-safe approved-skill attribution.
- **TS-005**: AI output MUST remain evidence-linked and pending until a human admin decision; it MUST NOT directly activate skills or qualify applications.
- **TS-006**: Installation verification, selection/consent, generation input, model result, backend validation outcome, admin decision, and revocation MUST leave sufficient audit history for disputes and incident review.
- **TS-007**: Low-confidence, malformed, unavailable, or insufficient evidence MUST produce explicit uncertainty, retry, or review behavior rather than invented skill certainty.
- **TS-008**: Per-user GitHub App authorization credentials MUST be encrypted, expiring, rotated through provider refresh, revocable, confined to the `github` module, and used only to verify that user's current installation/repository access; repository evidence MUST be read with a short-lived installation token.

### Key Entities

- **GitHub App Installation**: The provider-owned installation on one personal account or organization. Its provider installation ID and lifecycle are shared when multiple authorized organization members use it.
- **GitHub Installation Link**: A verified association between one Share-k user and a GitHub App installation. It records that user's access-verification and local connection state without sharing their repository choices for analysis, consent, generations, or skills with other linked users.
- **GitHub Member Authorization**: Encrypted, expiring GitHub App user authorization bound to one installation link and used only to revalidate that member's current provider access; it is not a repository-evidence credential.
- **Installed Repository Selection**: A repository currently granted to an installation and eligible to be offered for explicit analysis selection.
- **Analysis Consent**: The contributor's explicit agreement to analyze a bounded set of selected repositories for one generation workflow.
- **Skill Profile Generation**: A durable request with selected repositories, status, timestamps, failure or insufficiency outcome, and evidence snapshot references.
- **Skill Profile**: An evidence-linked skill candidate with proficiency, confidence, review status, and admin decision history.
- **Evidence Projection**: Role-specific allowlists for an owning contributor's generation detail, bounded admin review, the authorized skill-profiling AI request, and public-safe approved-skill output.

### External Dependency Behavior

- **Timeout/rate limit**: Provider delays and limits MUST produce bounded retry or a user-visible retryable state; they MUST NOT convert into successful or approved skill results.
- **Revocation/deletion**: Installation suspension, repository removal, and uninstallation MUST stop later access and invalidate affected pending work before another provider read.
- **Retry/idempotency/concurrency**: Repeated installation callbacks, provider notifications, and generation starts MUST not create conflicting installations or duplicate active work.
- **Partial failure**: Evidence that was safely collected from still-authorized repositories may remain attributable, while unavailable repositories and incomplete claims MUST be reported explicitly.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of tested users can complete registration and reach their normal profile while GitHub is disconnected or unavailable.
- **SC-002**: In security tests, 100% of private repository reads are limited to repositories selected in a verified active installation.
- **SC-003**: In workflow tests, zero generation jobs start from registration, social sign-in, or installation alone; every job has explicit repository selection and recorded consent.
- **SC-004**: In a pre-release usability test with at least 10 representative contributors, at least 90% can install the app, select repositories, and start analysis on their first attempt without facilitator intervention.
- **SC-005**: Users see an initial durable generation status within 3 seconds of explicitly starting analysis, excluding time spent at GitHub.
- **SC-006**: 100% of generated skill candidates displayed for review contain proficiency, confidence, and traceable evidence attribution.
- **SC-007**: Repository removal, installation suspension, or uninstallation blocks new affected private-evidence reads within 5 minutes of Share-k receiving or detecting the change.
- **SC-008**: Duplicate installation callbacks, notifications, and start requests produce no duplicate active installation or duplicate generation records in concurrency tests.

## Assumptions

- Existing registration, profile, repository picker, durable generation, AI validation, and admin-review capabilities will be reused and adapted.
- GitHub social sign-in may remain available as an optional identity-only path during migration.
- The first release supports installations on personal accounts and organizations, subject to the GitHub account owner's approval rules.
- Contributors select at least one and at most ten repositories per generation, matching current product behavior unless planning identifies an approved change.
- Existing approved skills and review history remain valid. Historical private OAuth evidence cannot be reused after production cutover; broad repository credentials are revoked/purged at cutover, raw private evidence is redacted or purged after 30 days, and unresolved legacy candidates transition to `needs_more_evidence`.
- Public repository project publication is outside this feature except where it consumes the same exported GitHub installation capability.
