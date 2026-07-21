# Feature Specification: GitHub-Backed Project Draft and Publication

**Feature Branch**: Current branch retained; no branch-creation hook is configured

**Created**: 2026-07-21

**Status**: Draft — clarified and ready for technical planning

**Input**: Jira SK-112, "GitHub-backed project draft, metadata review, and explicit publication"

**Traceability**: Jira SK-112; backlog TASK-2-03; dependency SK-107 / TASK-1-05;
PRD FR-034 through FR-039; constitution v3.0.0; ADR-002

## Source Classification *(mandatory for brownfield features)*

- **Current behavior**: An authenticated `OWNER` or `ADMIN` account can submit
  a public GitHub repository reference through a combined import-and-save
  interaction. The interaction immediately creates or updates a project, uses
  `draft` by default, and can publish in the same request when required reviewed
  fields are supplied. Repository identity is globally unique. Repeating the
  import as the same owner refreshes the project, but omitted owner-controlled
  values may be replaced by source values, and a published project can currently
  return directly to `draft`. Current project import supports public repositories
  without a connected GitHub account; separate evidence flows currently use
  broad repository OAuth and no GitHub App installation model exists.
  Owner-project reads include drafts, while a complete public project discovery
  contract does not yet exist.
- **Approved target behavior**: A preview is distinct from persistence; saving
  creates a private draft; only a later explicit confirmation can publish it.
  Both `OWNER` and `CONTRIBUTOR` accounts may create and own projects; the
  account role controls the primary journey rather than exclusive project
  capability. Project ownership and all later mutations are derived from the
  authenticated account and persisted project relationship. Private repository
  access uses an active GitHub App installation plus explicit repository
  selection. Any eligible account may preview and privately draft an allowed
  public repository. Publishing a personal repository requires the
  authenticated GitHub identity to match its owner; publishing an organization
  or shared repository requires an active GitHub App installation and explicit
  selection. Multiple intentional private drafts may reference the same
  canonical repository, but at most one may be published at a time. Drafts
  remain absent from every public path. A published project may be withdrawn
  only to `archived`, never directly to `draft`. Provider details remain
  redacted, manual edits survive refresh, and provider or indexing failure
  cannot corrupt a valid draft. GitHub-backed and future repository-free
  projects coexist.
- **Assumptions**: Public repository preview and private drafting do not require
  proof of repository control; publication does. Suspended or deactivated
  accounts cannot gain project capabilities. Private source material is never
  public merely because a ShareK project is published.
- **Unresolved decisions**: No feature-policy questions remain within this
  specification. Constitution v3.0.0 approves account-neutral project creation;
  the current account-role gate is an implementation and compatibility gap to
  address in planning.

## Clarifications

### Session 2026-07-21

- Q: Which account-role policy governs project creation? → A: Both `OWNER` and
  `CONTRIBUTOR` accounts may create and own projects; role controls the primary
  journey, while persisted ownership controls the resource.
- Q: What authority is required for a public-repository-backed project? → A:
  Any eligible account may preview and privately draft an allowed public
  repository, but verified repository control is required before publication.
- Q: How may multiple projects reference one canonical repository? → A:
  Multiple intentional private drafts are allowed, but at most one project may
  be published for a canonical repository at a time.
- Q: How may a published project be withdrawn? → A: It may transition only to
  `archived`; direct return to `draft` is prohibited, and reactivation is a
  separate future workflow.
- Q: What proves control of a public repository for publication? → A: A
  personal repository requires an authenticated GitHub identity matching its
  owner; an organization/shared repository requires an active GitHub App
  installation and explicit selection.

## User Scenarios & Testing *(mandatory)*

### Actors and Contextual Capabilities

- **Authenticated project initiator**: May preview an allowed repository. Under
  the accepted target, an eligible `OWNER` or `CONTRIBUTOR` account may create
  a draft without changing role.
- **Persisted project owner**: May view, edit, refresh, validate, and explicitly
  publish their own draft after satisfying the applicable repository-control
  requirement. The capability comes from the stored project-owner relationship,
  not an account ID, role, or ownership flag supplied by a client.
- **Authenticated non-owner**: Has no access to another user's draft merely
  because they are signed in, contributed elsewhere, or can access the source
  repository through GitHub.
- **Visitor**: May see only information from published projects that is approved
  for public disclosure.
- **Admin**: Has no implicit access to another user's private draft. Any future
  support or moderation bypass requires separate approval, an explicit action,
  auditability, and authorization coverage.
- **GitHub**: Supplies repository identity and source metadata. GitHub access
  never grants ShareK project ownership and never makes a draft public.

### User Story 1 - Preview Allowed Repository Metadata (Priority: P1)

As an authenticated user, I can submit a supported GitHub repository reference
and receive normalized metadata or a safe, actionable error before deciding to
create a project.

**Why this priority**: A trustworthy preview is the entry point to the entire
workflow and prevents users from creating projects from an invalid or
unauthorized source.

**Independent Test**: Submit valid public and authorized private repository
references plus invalid, inaccessible, and unsupported references; verify that
each produces either a normalized preview or a safe error and creates no
project.

**Acceptance Scenarios**:

1. **Given** an authenticated user and an allowed public repository, **When**
   the user requests a preview, **Then** normalized source metadata and source
   status are returned without creating or publishing a project.
2. **Given** an authenticated user with an active GitHub App installation and
   an explicitly selected private repository, **When** the user requests a
   preview, **Then** permitted normalized metadata is returned only to that
   user.
3. **Given** an invalid, unsupported, inaccessible, unselected, or revoked
   repository reference, **When** a preview is requested, **Then** the user
   receives a safe actionable result that does not disclose whether unrelated
   private content exists.

---

### User Story 2 - Create and Save a Private Draft (Priority: P1)

As the initiating user, I can create and save an unpublished project draft from
the previewed metadata so I can complete it before anyone else sees it.

**Why this priority**: Draft persistence separates source inspection from the
public commitment to publish.

**Independent Test**: Save a project from a valid preview and verify that the
authenticated account becomes its persisted owner, the project remains a
draft, and no public consumer can retrieve it.

**Acceptance Scenarios**:

1. **Given** a valid preview, **When** the eligible user confirms draft
   creation, **Then** one private draft is saved and the authenticated user is
   recorded as its owner.
2. **Given** a preview that has not been confirmed, **When** the user leaves or
   retries the preview, **Then** no project is created and nothing is published.
3. **Given** a valid saved draft, **When** GitHub or indexing is unavailable,
   **Then** the draft remains intact and available to its owner.
4. **Given** another private draft for the same canonical repository, **When**
   a user intentionally creates their own private draft, **Then** both drafts
   may coexist without exposing either draft to the other owner.

---

### User Story 3 - Review and Edit Owner-Controlled Information (Priority: P1)

As the persisted project owner, I can edit owner-controlled information without
changing the repository's source identity or falsifying source metadata.

**Why this priority**: Owners need a useful ShareK presentation while users must
still be able to distinguish curated project information from provider facts.

**Independent Test**: Edit every owner-controlled field, attempt to alter
source-owned identity, and verify that permitted edits persist while source
identity remains unchanged.

**Acceptance Scenarios**:

1. **Given** an owned draft, **When** its owner edits permitted project
   information, **Then** the edits are saved and identified as owner-controlled.
2. **Given** an owned draft, **When** a request attempts to change provider,
   provider repository identity, canonical source, or source visibility as if
   it were owner-controlled data, **Then** the change is rejected.
3. **Given** a non-owner, **When** they attempt to edit the draft, **Then** no
   project data changes and no private draft data is revealed.

---

### User Story 4 - Refresh Without Losing Manual Edits (Priority: P2)

As the persisted project owner, I can refresh imported metadata and understand
what changed without silently losing my manual edits.

**Why this priority**: Repository metadata changes over time, but refresh must
not destroy the owner's reviewed project narrative.

**Independent Test**: Change the available source metadata after saving manual
overrides, refresh the project, and verify that source fields update, manual
overrides remain, and freshness/failure status is visible.

**Acceptance Scenarios**:

1. **Given** an owner-edited draft and newer source metadata, **When** the owner
   refreshes it, **Then** source-owned values and freshness status update while
   all manual overrides remain unchanged.
2. **Given** a partial provider response, **When** refresh completes, **Then**
   available source fields update, unavailable fields retain their last valid
   values, and the partial result is visible to the owner.
3. **Given** revoked or expired authorization for a private repository,
   **When** refresh is requested, **Then** no private read occurs, the saved
   draft is not corrupted, and its authorization/freshness status becomes
   actionable.

---

### User Story 5 - Explicitly Publish a Valid Draft (Priority: P1)

As the persisted project owner, I can explicitly publish a valid reviewed draft
so approved project information becomes available to public consumers.

**Why this priority**: Publication is the business outcome, but it must remain a
deliberate transition after review rather than a side effect of import.

**Independent Test**: Attempt to publish complete, incomplete, stale, and
already-published projects as the owner and as a non-owner; verify the approved
transition and safe rejection behavior.

**Acceptance Scenarios**:

1. **Given** a complete owned draft, **When** the owner explicitly confirms
   publication, **Then** it becomes published once with an auditable publication
   time.
2. **Given** an incomplete or invalid draft, **When** publication is requested,
   **Then** it remains private and the owner receives field-specific guidance.
3. **Given** a public-repository-backed draft without verified repository
   control, **When** publication is attempted, **Then** it remains private and
   the owner receives safe guidance for establishing control.
4. **Given** a personal public repository, **When** the authenticated GitHub
   identity matches the repository owner, **Then** its owner-control requirement
   is satisfied without treating OAuth as repository-access authorization.
5. **Given** an organization or shared public repository, **When** it has an
   active GitHub App installation and explicit selection, **Then** its
   owner-control requirement is satisfied.
6. **Given** a preview or unsaved import, **When** publication is attempted,
   **Then** it cannot bypass draft creation and review.
7. **Given** AI or semantic indexing is delayed or unavailable, **When** a valid
   draft is explicitly published, **Then** publication succeeds independently
   and later processing can report its own status.
8. **Given** another project is already published for the same canonical
   repository, **When** an owner attempts publication, **Then** their project
   remains a draft and the conflict exposes only information already public.
9. **Given** an owner withdraws their published project, **When** the withdrawal
   succeeds, **Then** the project becomes archived and non-public without being
   represented as a never-published draft.

---

### User Story 6 - Keep Unpublished Projects Private (Priority: P1)

As a visitor or authenticated non-owner, I cannot view or discover an
unpublished project through any public or contributor-facing path.

**Why this priority**: Draft privacy is a platform invariant, not a frontend
display preference.

**Independent Test**: Create a draft and attempt to reach it through every
public listing, direct detail, search, discovery, indexing, and related public
aggregate; verify that it never appears and its existence is not leaked.

**Acceptance Scenarios**:

1. **Given** a draft, **When** any visitor or non-owner uses a public listing,
   detail, search, discovery, or indexing path, **Then** the draft and its
   metadata are absent.
2. **Given** a guessed draft identifier, **When** a non-owner requests it,
   **Then** the result does not reveal whether a private draft exists.
3. **Given** a published project and a draft, **When** public counts or owner
   summaries are produced, **Then** only explicitly public aggregates include
   the published project and no private draft details leak.

---

### User Story 7 - Understand Source and Refresh Status (Priority: P2)

As the persisted project owner, I can see source attribution, source visibility,
authorization state, selection state, freshness, last successful refresh, and
partial-failure status so I know how trustworthy the imported metadata is.

**Why this priority**: Owners need to distinguish current provider facts from
manual project content and stale or unavailable evidence.

**Independent Test**: Review a fresh public source, a selected private source,
a stale source, a partially refreshed source, and a revoked source; verify that
the owner can distinguish each state without receiving credentials or provider
internals.

**Acceptance Scenarios**:

1. **Given** a successfully previewed or refreshed repository, **When** the
   owner reviews source status, **Then** source identity, permitted visibility,
   selection/authorization status, source version when available, and freshness
   time are understandable.
2. **Given** a failed or partial refresh, **When** the owner reviews status,
   **Then** the last successful freshness time remains visible alongside a safe
   failure state and suggested next action.
3. **Given** a public viewer, **When** they view a published project, **Then**
   they receive only explicitly public attribution and never installation,
   authorization, private-source, or provider-error details.

### Edge Cases

- The reference is empty, malformed, from an unsupported host, contains an
  unsupported path, or resolves to a repository different from its canonical
  identity.
- A repository is private, deleted, transferred, renamed, archived, disabled,
  converted between public and private, or removed from an installation.
- A public repository is valid but platform policy does not allow importing it.
- GitHub returns no description, README, languages, topics, statistics, or
  update timestamp.
- Some metadata succeeds while other metadata is unavailable, delayed, or
  rate-limited.
- The same user repeats preview, draft creation, refresh, or publication after
  a timeout and cannot tell whether the prior action completed.
- Two sessions edit or refresh the same draft concurrently.
- Two users attempt to create projects from the same canonical repository.
- Two eligible owners concurrently attempt to publish separate drafts backed
  by the same canonical repository.
- A published project is withdrawn while a refresh or public read is in flight.
- The source changes after preview but before draft creation or publication.
- Authorization is revoked during a private repository refresh.
- A private-backed draft is published without any provider-derived private
  content being eligible for public disclosure.
- Indexing fails after publication or receives the same publication fact more
  than once.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST authenticate a user before accepting a repository
  preview, draft creation, edit, refresh, or publication action.
- **FR-002**: The system MUST accept supported GitHub repository references,
  normalize equivalent references to one canonical source identity, and reject
  malformed or unsupported references safely.
- **FR-003**: The system MUST allow eligible `OWNER` and `CONTRIBUTOR` accounts
  to enter the project-owning journey without requiring a role change, while
  allowing the same account to contribute elsewhere through the applicable
  contextual relationships, as required by constitution v3.0.0.
- **FR-004**: The system MUST return a normalized metadata preview without
  creating, modifying, or publishing a ShareK project.
- **FR-005**: The preview MUST distinguish source-provided metadata,
  owner-editable starting values, source attribution, freshness, source
  visibility, and authorization/selection status.
- **FR-006**: A public repository MAY be previewed through permitted public
  provider information and used for a private draft without proof of repository
  control; this permission alone MUST NOT authorize publication.
- **FR-007**: A private repository MUST be previewed or refreshed only while an
  active GitHub App installation authorizes read access and the repository is
  explicitly selected.
- **FR-008**: The system MUST create a project only after the user explicitly
  confirms draft creation from a valid preview.
- **FR-009**: Draft creation MUST persist the authenticated account as project
  owner without accepting a client-supplied owner identity as evidence.
- **FR-010**: The persisted project owner MUST be able to retrieve and save
  their draft, and non-owners MUST NOT gain that capability from account role,
  source-repository access, or client-supplied identity data.
- **FR-011**: The persisted project owner MUST be able to edit the approved
  owner-controlled fields while source-owned repository identity remains
  immutable through ordinary project editing.
- **FR-012**: The persisted project owner MUST be able to refresh source
  metadata without silently overwriting owner-controlled values.
- **FR-013**: Refresh MUST report which source areas were updated, unchanged,
  unavailable, or stale, without exposing provider internals.
- **FR-014**: The system MUST preserve the last valid draft when preview,
  refresh, GitHub, or downstream indexing fails.
- **FR-015**: The system MUST publish only a saved draft that passes the
  approved completeness and validity rules and receives a separate explicit
  publication confirmation from its persisted owner. A public-repository-backed
  draft MUST also have a current verified repository-control relationship.
- **FR-016**: Preview, import, draft creation, edit, and refresh MUST NOT
  implicitly publish a project.
- **FR-017**: AI analysis and semantic indexing MUST remain outside this
  feature and MUST NOT be prerequisites for publishing a valid draft.
- **FR-018**: The feature MUST preserve compatibility with a future project
  creation journey that has no GitHub repository.
- **FR-019**: The system MUST allow multiple intentional private drafts to
  reference the same canonical repository while permitting at most one
  `published` project for that canonical repository at a time. A publication
  conflict MUST leave the losing project as a valid private draft and MUST
  expose only information already available through the published project.
- **FR-020**: No Admin account MUST receive implicit access to another user's
  draft through this feature; any Admin bypass is separately approved,
  explicit, auditable, and tested.
- **FR-021**: Repository-control evidence MUST NOT be inferred from a repository
  reference or client-supplied claim. For a personal public repository, the
  authenticated GitHub identity MUST match the repository owner. For an
  organization or shared repository, an active GitHub App installation MUST
  authorize the explicitly selected repository. Control MUST be re-evaluated
  when identity, installation authorization, selection, or ownership changes.

### Draft and Publication State Requirements

- **SR-001**: A project created by this feature MUST begin as `draft`.
- **SR-002**: Previewed metadata is transient feature input and MUST NOT be
  treated as a project state.
- **SR-003**: Only the persisted owner may request the transition from `draft`
  to `published` through the ordinary journey, and repository control MUST be
  verified when the draft is backed by a public repository.
- **SR-004**: Publication MUST be an explicit, validated, auditable transition
  and MUST record when the project first became public.
- **SR-005**: A failed publication attempt MUST leave the project as a valid
  private draft with its prior data intact.
- **SR-006**: Repeating a successful publication request MUST NOT create a
  second project or duplicate publication side effects.
- **SR-007**: Concurrent publication attempts for drafts backed by the same
  canonical repository MUST result in at most one published project.
- **SR-008**: A persisted owner MAY withdraw a published project only through
  an explicit `published` to `archived` transition. Direct `published` to
  `draft` transition MUST be rejected.
- **SR-009**: Reactivation, republishing from `archived`, and deletion are not
  defined by this feature and MUST NOT be inferred from the publication or
  withdrawal flow.

### Imported Versus Owner-Controlled Data Requirements

- **DR-001**: Source-owned data MUST include provider identity, canonical
  repository identity, provider repository ID when available, source
  visibility, default branch, source version or update marker, and fetch time.
- **DR-002**: Imported metadata MAY include repository name, description,
  language data, topics, activity/statistics, and README-derived source content
  when each item is permitted and available.
- **DR-003**: Owner-controlled project data MUST include the reviewed project
  title, project description, project tags/technologies, category, difficulty,
  and only additional ShareK presentation fields explicitly approved by a
  later specification amendment.
- **DR-004**: The owner-visible project view MUST distinguish the latest source
  snapshot from owner-controlled effective values and MUST identify manual
  overrides.
- **DR-005**: Refresh MUST update source-owned data and source-derived defaults
  without replacing a manual override unless the owner explicitly chooses to
  restore the source value.
- **DR-006**: Missing or partially unavailable source metadata MUST NOT be
  represented as verified empty data when the true state is unknown.
- **DR-007**: Source attribution and freshness MUST remain attached to imported
  values through preview, draft, refresh, and publication review.

### Privacy and Redaction Requirements

- **PR-001**: Every public listing, direct detail, search, discovery, indexing,
  aggregate, and related public read MUST exclude draft projects at the backend
  visibility boundary.
- **PR-002**: Public responses MUST use an explicit allowlist and MUST NOT expose
  provider tokens, installation identifiers or permissions, private repository
  content, private evidence, internal provider objects, raw persistence data,
  stack traces, or internal provider errors.
- **PR-003**: Private repository identity and metadata MUST remain private by
  default. Publishing a ShareK project MUST NOT itself authorize disclosure of
  its private source identity or content.
- **PR-004**: Revocation, repository unselection, or loss of installation access
  MUST stop all later private reads and downstream use of private source
  material.
- **PR-005**: Safe inaccessible/not-found responses MUST avoid confirming the
  existence, ownership, or selection of a private repository to an unauthorized
  user.
- **PR-006**: Owner-facing authorization and refresh status MUST provide enough
  information to recover without exposing credentials or installation details.

### Validation and External Failure Requirements

- **VR-001**: Validation MUST cover repository reference format, supported host,
  canonical identity, source availability, visibility, selection, authorization,
  and project publication completeness.
- **VR-002**: The system MUST provide safe actionable outcomes for invalid
  references, unsupported repositories, not-found or inaccessible sources,
  authorization expiry/revocation, rate limits, timeouts, provider outages,
  malformed provider data, missing metadata, and partial metadata.
- **VR-003**: Required preview data failure MUST prevent draft creation from an
  untrustworthy preview; optional metadata failure MAY produce a clearly marked
  partial preview.
- **VR-004**: A refresh failure MUST preserve the last valid source snapshot,
  all owner edits, the current project state, and the last successful freshness
  time.
- **VR-005**: A downstream indexing failure after publication MUST NOT reverse
  or corrupt the valid publication and MUST NOT expose a draft or private
  evidence.

### Idempotency, Concurrency, Refresh, and Freshness Requirements

- **IR-001**: Repeating the same preview MUST have no project-side effect.
- **IR-002**: Retrying draft creation after an uncertain outcome MUST not create
  multiple unintended projects for the same accepted intent, while a distinct
  intentional draft remains allowed.
- **IR-003**: Retrying publication MUST be safe and MUST not duplicate public
  records, audit facts, or downstream notifications/indexing requests.
- **IR-004**: Concurrent edits, refreshes, and publication attempts MUST not
  silently lose an owner's newer manual changes; conflicting actions MUST yield
  one deterministic result or an actionable conflict.
- **IR-005**: Refresh MUST retain the previous successful source snapshot until
  a new permitted snapshot is complete enough to adopt.
- **IR-006**: The owner MUST be able to distinguish fresh, stale, refreshing,
  partially refreshed, failed, and authorization-revoked source states.
- **IR-007**: Freshness MUST identify the last successful source read and, when
  available, the source version or source update time used for that read.

### Trust, Safety, and Audit Requirements

- **TS-001**: The system MUST derive identity from authentication and project
  ownership from the persisted relationship; request-supplied user IDs, owner
  IDs, account roles, or Admin flags MUST NOT serve as authorization evidence.
- **TS-002**: The publication decision MUST record the acting owner, prior and
  resulting state, time, and validation outcome without storing secrets or
  unnecessary private evidence.
- **TS-003**: Repository selection, visibility, authorization, provenance,
  freshness, version, uncertainty, and redaction status MUST remain available
  wherever imported evidence is evaluated or disclosed.
- **TS-004**: Public visibility MUST be enforced independently of frontend
  filtering and independently of whether indexing is available.
- **TS-005**: AI MUST make no publication decision and MUST NOT fabricate or
  complete missing repository metadata in this feature.

### Key Entities

- **Project**: A ShareK collaboration opportunity with a persisted owner,
  owner-controlled presentation, explicit visibility state, and optional source
  association.
- **Repository Source**: The canonical GitHub repository identity and its
  visibility, version/update markers, and permitted source metadata.
- **Metadata Preview**: A non-persistent, normalized review view created from a
  currently permitted repository source.
- **Source Snapshot**: The last successfully adopted imported metadata,
  provenance, freshness, partial-failure, and redaction state associated with a
  project.
- **Repository Authorization**: The public-access or GitHub App installation
  and explicit-selection facts that permit a source read, plus the matching
  personal GitHub identity or organization/shared installation relationship
  used to establish publication control; it is not ShareK project ownership.
- **Publication Record**: The explicit owner action and validated transition
  that made an approved project view public.

### API Contract Impact

- **Interaction(s)**: Repository submission and preview; draft creation and
  owner-only retrieval/edit; source refresh/status; explicit publication; and
  public published-project reads. Exact transport paths are deferred to the
  implementation plan after the current contract is audited for reuse.
- **Request validation**: Repository reference and expected source context;
  owner-controlled project fields; explicit draft creation or publication
  intent; and concurrency context where required. Identity, ownership, role,
  and Admin privilege are never accepted as authority from request data.
- **Response contract**: Explicitly allowlisted preview, project, source-status,
  publication, and safe error views. Raw provider, persistence, installation,
  token, private evidence, and internal error objects are prohibited.
- **Pagination**: Required for any project listing introduced or affected by
  the feature; not applicable to a single preview, draft, refresh, or
  publication result.

### External Dependency Behavior

- **Timeout/rate limit**: Return a safe retryable outcome with useful retry
  guidance; do not mutate a saved draft on an incomplete refresh.
- **Revocation/deletion**: Stop private reads immediately, mark authorization or
  source status accordingly, and prevent later public/private-evidence leakage
  while retaining the owner's valid ShareK draft.
- **Retry/idempotency/concurrency**: Retried and overlapping actions follow the
  requirements above and never create unintended duplicate projects or discard
  newer manual edits silently.
- **Partial failure**: Preserve the last valid source snapshot and owner data;
  adopt permitted available fields only when their partial status is explicit.

### Requirement-to-Acceptance Traceability

| Requirement groups | Primary acceptance coverage | Measurable outcomes |
|---|---|---|
| FR-001–FR-007, VR-001–VR-003 | User Story 1 | SC-001, SC-002, SC-006 |
| FR-008–FR-010, SR-001–SR-003 | User Stories 2 and 6 | SC-002, SC-003 |
| FR-011, DR-001–DR-007 | User Stories 3 and 7 | SC-004, SC-006 |
| FR-012–FR-014, VR-004–VR-005, IR-005–IR-007 | User Stories 4 and 7 | SC-004, SC-007 |
| FR-015–FR-017, SR-004–SR-009 | User Story 5 | SC-005, SC-009 |
| FR-018–FR-021, PR-001–PR-006, TS-001–TS-005 | User Stories 2, 3, 5, and 6 | SC-003, SC-006, SC-010 |
| IR-001–IR-004 | User Stories 1, 2, 4, and 5 | SC-008 |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of users with an allowed repository can obtain a
  preview or a clear actionable error within 10 seconds under normal provider
  conditions.
- **SC-002**: In acceptance coverage, 100% of previews create no project and
  100% of newly created projects begin as private drafts.
- **SC-003**: In authorization and public-contract coverage, 100% of drafts are
  absent from public listing, detail, search, discovery, indexing, and public
  aggregate paths.
- **SC-004**: In refresh coverage, 100% of owner-controlled manual edits survive
  successful, partial, failed, and retried refreshes unless the owner explicitly
  restores a source value.
- **SC-005**: In state-transition coverage, 100% of published projects have a
  prior saved draft, an explicit owner confirmation, valid mandatory project
  information, required repository-control evidence, and exactly one effective
  publication transition; 100% of owner withdrawals transition to `archived`
  and never directly to `draft`.
- **SC-006**: Security and contract verification finds zero disclosures of
  provider tokens, installation details, private repository content, private
  evidence, raw provider/persistence objects, or internal provider errors.
- **SC-007**: Provider timeout, rate-limit, outage, revocation, and partial-data
  scenarios preserve 100% of previously valid draft and owner-controlled data.
- **SC-008**: Repeated or concurrent accepted operations create no unintended
  duplicate project or publication fact and never silently discard a newer
  manual edit.
- **SC-009**: A valid publication completes without waiting for AI or semantic
  indexing in 100% of dependency-failure acceptance scenarios.
- **SC-010**: Review of the resulting project contract confirms that GitHub is
  optional for the project concept and does not prevent a later repository-free
  creation journey.

## Assumptions

- Public GitHub repositories may be previewed from permitted public metadata
  and privately drafted without proof of control. Personal-repository
  publication uses a matching authenticated GitHub identity only as identity
  proof; organization/shared publication requires active GitHub App selection.
- Private repository support is part of the approved target but depends on
  SK-107 providing a GitHub App installation and explicit-selection capability;
  the current broad OAuth evidence grant is not sufficient.
- A user's account may own projects and also participate as a contributor in
  projects they do not own; contributor access remains governed by the relevant
  application or assignment relationship.
- Existing account-status restrictions remain in force; this feature does not
  reactivate suspended or deactivated accounts.
- Title, description, tags/technologies, category, and difficulty are the
  initial owner-controlled fields, consistent with the current review behavior.
- Repository identity, visibility, provider update markers, language facts,
  README-derived content, and repository statistics remain source-owned.
- Multiple intentional private drafts may reference one canonical repository,
  but only one may be published for that repository at a time.
- Public project discovery and semantic indexing may be delivered separately,
  but every current or future public consumer must honor the visibility rules
  defined here.

## Out of Scope

- Frontend screens, forms, navigation, or client-side behavior.
- AI-authored project content, AI publication decisions, skill matching, or
  semantic indexing implementation.
- Public discovery implementation beyond enforcing that drafts cannot appear
  in any present or future public path.
- Contribution requests, applications, assignments, delivery, reputation,
  chat, notifications, subscriptions, or billing.
- GitHub repository writes, issue creation, pull request actions, or any
  write-capable provider permission.
- Public registration or post-registration account-role change workflows; this
  feature changes project-creation capability, not stored account-role values.
- A general repository-free creation flow; only compatibility with that future
  flow is required.
- Admin support/moderation access to another user's draft.
- Reactivation or republishing from `archived`, deletion, ownership transfer,
  team ownership, or project-fork workflows.
- Selecting an indexing provider or defining an AI service contract.
