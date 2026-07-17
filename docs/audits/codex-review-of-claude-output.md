# Documentation architecture review

  Reviewed against master at a61e067 (the branch merge base). The change contains 91 documentation mutations: 25 additions, 11 modifications, 4 deletions, and 51 exact renames. I
  also inspected the manifests, Prisma schema and all 10 migrations, module implementations, tests, Postman collection, OpenAPI definition, active agent instructions, deleted
  documents from Git history, and archived PDFs/DOCX files.

  No files were modified. The worktree remains clean.

  ## BLOCKER findings

  ### B1 — Claude-generated documents declare themselves approved without an approval record

  - Location: docs/AGENTS.md:12, docs/product-brief.md:3, docs/prd.md:3, docs/architecture.md:3, docs/migration-notes.md:18.
  - Risky statement: nearly every new canonical document is marked APPROVED, while docs/AGENTS.md explicitly says the Claude session is unapproved. migration-notes.md claims “LOCKED
    DECISIONS” are authoritative merely because they are “embodied” across the documents.

  - Why it matters: this converts generated interpretation into governance authority without a human decision log. It also contradicts the prescribed precedence, which places
    approved decisions ahead of product and architecture documents.

  - Source that should survive: explicit human decisions and a human-ratified decision log. The root spec.md is useful source material but is itself PROPOSED.
  - Correction: downgrade all new documents and ADRs to PROPOSED until individually ratified. Create a short decision log recording approver, date, decision, alternatives, and
    superseded source.

  - Consolidation: Blocks consolidation.

  ### B2 — GitHub OAuth and private-repository behavior are materially misreported

  - Location: docs/api-contracts.md:102, docs/prd.md:78, docs/epics-and-stories.md:24.
  - Risky statement: contributor OAuth is described as already using only public_repo, with no private access.
  - Repository evidence: backend/src/modules/github/services/github-oauth.service.ts:18 defines contributor scope as read:user user:email repo; backend/src/modules/github/
    integrations/github-api.client.ts:116 requests visibility=all; and backend/src/modules/skill-profiles/services/skill-profile-generation.service.ts:140 passes the repository’s
    private flag and README-derived evidence into AI processing.

  - Why it matters: repo grants access to private repositories and write-capable repository permissions. The current AI flow can process private-repository material, directly
    contradicting NFR-04 and the claimed public-only boundary.

  - Source that should survive: FR-02/NFR-04’s public-only, least-privilege policy.
  - Correction: record this as a security and privacy implementation gap. Restrict selection and processing to public repos, replace/revoke tokens, require renewed consent, and
    audit/delete any private evidence snapshots already persisted.

  - Consolidation: Blocks consolidation.

  ### B3 — The accepted AiPort architecture cannot be implemented under the repository’s own rules

  - Location: docs/architecture.md:48, docs/adr/adr-003-ai-via-nestjs-aiport.md:5, docs/ai-agent-rules.md:24.
  - Conflict: the target requires a one-implementation AiPort. docs/backend-conventions.md:14 prohibits ports, while ai-agent-rules.md prohibits abstract interfaces without multiple
    implementations. The architecture checker rejects .port.ts files at backend/scripts/check-architecture.mjs:113. docs/developer-architecture-guide.md:22 still calls the AI module
    a FastAPI-client owner.

  - Why it matters: an engineer cannot faithfully satisfy the ADR, conventions, guide, and checker at the same time.
  - Source that should survive: the simple feature-first NestJS rule unless humans explicitly approve an exception. The current AiService/FastAPI implementation should remain the
    documented current state until a migration decision is ratified.

  - Correction: choose one architecture. For an in-process implementation, prefer a concrete provider client behind AiService; introduce an interface only when a second
    implementation exists. Update the checker, active instructions, local-development docs, module README, environment contract, and tests atomically.

  - Consolidation: Blocks consolidation.

  ### B4 — A required engineering tracker was deleted while all live consumers still require it

  - Location: docs/README.md:53, docs/migration-notes.md:74.
  - Risky statement: module-development-tracker.md was deleted as having “no historical value.”
  - Conflict: backend/AGENTS.md:13, backend/README.md:20, backend/src/modules/README.md:28, the backend skill, PR template, and backend/scripts/check-architecture.mjs:81 all require
    it.

  - Why it matters: the base tracker also contains unique implementation history from July 7–16, including migrations, routes, tests, and architecture changes. It is neither
    valueless nor safely deletable. npm run check:architecture currently fails, including on the missing tracker; it also exposes separate monorepo path issues.

  - Source that should survive: the tracker’s historical records and whichever future workflow the team chooses.
  - Correction: restore it at least as an archived implementation log, then either retain it as the active tracker or update every consumer and checker rule to an explicit
    replacement in the same change.

  - Consolidation: Blocks consolidation.

  ### B5 — The institutional capstone requirements were archived without deciding whether they are binding

  - Location: docs/archive/bmad-legacy-docs/AI-Enabled Capstone Project Checklist.pdf, docs/product-brief.md:58, docs/prd.md:262, docs/test-strategy.md:7.
  - Conflict: the new product direction rejects RAG, multi-agent orchestration, multimodal capabilities, an LLM observability platform, and larger evaluation suites. The archived
    ITI checklist labels RAG, agentic AI, orchestration, observability, cloud deployment, and other areas MUST-HAVE, and states all must-have sections are required to pass.

  - Why it matters: the new scope may be strategically better but could fail the capstone evaluation if the checklist applies. Calling it “legacy Gold Tier positioning” does not
    resolve an external requirement.

  - Source that should survive: this requires a human/institutional ruling. Until then, the checklist is an external constraint, not ordinary historical documentation.
  - Correction: obtain written confirmation about which checklist requirements apply. If binding, design the smallest compliant advisory AI demonstration without granting AI
    business authority. If nonbinding, record that decision and approver.

  - Consolidation: Blocks consolidation.

  ## HIGH findings

  ### H1 — Staff can impersonate maintainers of arbitrary external repositories

  - Location: docs/prd.md:124, docs/seed-and-validation-plan.md:13.
  - Risky statement: a staff member or “trusted owner” may select an external repository and become its owner of record.
  - Why it matters: that person may have no upstream authority to define tasks, accept work, or attest that a contribution was accepted. The existing import endpoint permits an
    owner/admin to import any public repository and then prevents another user from importing it.

  - Source that should survive: GitHub is authoritative for connected code, and owners remain accountable for acceptance.
  - Correction: require verified maintainer or organization authorization for repository-linked ownership. Staff may curate discovery links but must not accept work or issue
    reputation for an upstream repository they do not control.

  - Consolidation: Blocks consolidation.

  ### H2 — The proposed collusion mitigation does not prevent reputation fraud

  - Location: docs/product-brief.md:88, docs/prd.md:121, docs/prd.md:162, docs/data-model-and-erd.md:72.
  - Risky statement: individual links plus owner review are presented as sufficient mitigation against friends creating fake projects and rating one another.
  - Why it matters: two colluding accounts can create a repository-free project, submit an arbitrary OTHER link, approve it, publish reviews, and create “verified” reputation. The
    closed-PR flag does not detect this.

  - Source that should survive: repository-free projects and links-only evidence can remain, but “verified” must mean more than owner approval.
  - Correction: define evidence trust tiers; evidence uniqueness; repeated-pair and review-ring detection; new-account weighting; unique-owner/project counts; and a rule that weak
    owner-attested evidence is visibly distinct from independently verified evidence.

  - Consolidation: Blocks consolidation.

  ### H3 — Individual contribution evidence is asserted but not modelled

  - Location: docs/prd.md:168, docs/prd.md:177, docs/data-model-and-erd.md:63.
  - Risky statement: several contributors may reuse one PR and merely describe their individual roles; roleDescription is nullable.
  - Why it matters: PR authorship validation proves at most the PR author, not every claimant. The model has no commit ranges, co-author evidence, issue/activity attribution,
    evidence uniqueness, or per-person owner attestation.

  - Source that should survive: mandatory individual evidence.
  - Correction: require a per-contributor attribution record with commit hashes/ranges, GitHub identity, role, owner attestation, and source snapshot. Define uniqueness and count
    one contribution per accepted assignment, not per evidence URL.

  - Consolidation: Blocks consolidation.

  ### H4 — maxContributors conflicts with a single-assignment task state machine

  - Location: docs/data-model-and-erd.md:54, docs/data-model-and-erd.md:83.
  - Conflict: a task supports maxContributors, but the first acceptance moves the whole task to ASSIGNED, and one approved evidence item moves it to COMPLETED.
  - Why it matters: multiple accepted contributors cannot have independent assignment, delivery, and completion states. One contributor could complete or close the task for
    everyone.

  - Source that should survive: individual attribution and task-scoped applications.
  - Correction: simplest MVP correction is maxContributors = 1. Otherwise add an Assignment entity per accepted application and define when the parent task closes.
  - Consolidation: Blocks consolidation.

  ### H5 — “Request changes” has no viable resubmission model

  - Location: docs/data-model-and-erd.md:63, docs/data-model-and-erd.md:66, docs/data-model-and-erd.md:119, spec.md:128.
  - Conflict: DeliveryReview.evidenceId is unique, and any review terminates the evidence state machine. The approved frontend direction requires updating or resubmitting after
    changes are requested.

  - Why it matters: the same evidence cannot later receive approval, while creating unrelated replacement evidence loses revision history and deadline semantics.
  - Source that should survive: request-changes/resubmit behavior from the approved loop.
  - Correction: model a submission with versioned attempts, or permit multiple reviews with one final verdict per attempt and a supersedesEvidenceId.
  - Consolidation: Blocks consolidation.

  ### H6 — Terminal applications grant applicant access forever

  - Location: docs/data-model-and-erd.md:33, docs/prd.md:242.
  - Risky statement: APPLICANT is derived whenever any application exists, regardless of status.
  - Why it matters: rejected, withdrawn, and expired applicants retain private-workspace and comment permissions indefinitely.
  - Source that should survive: contextual capability model.
  - Correction: derive applicant access only from explicitly active states and only for the relevant task/project. Define terminal-status revocation tests.
  - Consolidation: Blocks consolidation.

  ### H7 — Skill evidence cannot represent the approved facts

  - Location: docs/prd.md:104, docs/data-model-and-erd.md:45, docs/frontend-spec.md:32.
  - Conflict: the PRD says one state per skill but also says CONTRIBUTION_DEMONSTRATED and ADMIN_REVIEWED may both apply. The model stores one enum.
  - Why it matters: one verified fact must be discarded, and the frontend cannot visibly separate sources truthfully.
  - Source that should survive: evidence sources are independent facts.
  - Correction: store separate evidence-source records or explicit booleans/timestamps. If a single display label is desired, define presentation precedence separately from stored
    evidence.

  - Consolidation: Blocks consolidation.

  ### H8 — Blind reviews do not publish when both parties submit

  - Location: docs/data-model-and-erd.md:146, docs/prd.md:191, docs/adr/adr-010-blind-review-expiry-publish-one.md:5.
  - Conflict: the state rules require the review window to expire even when both reviews are already submitted.
  - Why it matters: this contradicts the central blind-review rule and unnecessarily delays publication.
  - Source that should survive: publish when both submit or when the window expires.
  - Correction: add immediate atomic publication on counterpart submission. Also specify the review-window duration, rating scale, and exact definition of an “extreme” rating.
  - Consolidation: Blocks consolidation.

  ### H9 — Closed PR attestations have two indistinguishable outcomes

  - Location: docs/data-model-and-erd.md:130, docs/prd.md:171, docs/adr/adr-008-pr-evidence-merged-or-attested.md:5.
  - Conflict: CLOSED_WITHOUT_MERGE + owner attestation transitions to both ACCEPTED_NOT_MERGED and FLAGGED.
  - Why it matters: the implementation cannot choose deterministically. It also confuses legitimate not-yet-merged acceptance with suspicious closed/rejected evidence.
  - Source that should survive: FR-35’s integrity rule.
  - Correction: use FLAGGED for closed-without-merge plus acceptance. Reserve ACCEPTED_NOT_MERGED for open/not-yet-merged PRs with attestation, or remove it and keep GitHub state
    plus a separate attestation field.

  - Consolidation: Blocks consolidation.

  ### H10 — The public-profile contract is both auth-gated and path-inconsistent

  - Location: docs/api-contracts.md:70, docs/api-contracts.md:98, docs/frontend-spec.md:88.
  - Conflict: the backend route is /contributors/profiles/:username and requires AccessTokenGuard; the frontend expects unauthenticated /users/:username; the API gap list omits both
    the authentication removal and canonical route decision.

  - Repository evidence: backend/src/modules/contributor-profiles/contributor-profiles.controller.ts:11, existing OpenAPI global security, and authenticated-only E2E tests.
  - Why it matters: the highest-priority screen cannot work for logged-out hiring reviewers.
  - Source that should survive: FR-18 and root spec.md require a public profile.
  - Correction: preferably retain the existing backend path, make its GET public, add a guest viewer relationship, and update OpenAPI, Postman, tests, and frontend expectations
    together.

  - Consolidation: Blocks consolidation.

  ### H11 — Repository-free project behavior is not represented consistently

  - Location: docs/prd.md:121, docs/prd.md:127, docs/data-model-and-erd.md:51, docs/architecture.md:117.
  - Conflict: FR-20 calls PRE_REPOSITORY a status, but the target model uses repository status NONE. The current Prisma schema requires a unique non-null github_repo_url, yet the
    “complete” schema-gap list omits this required migration.

  - Why it matters: a product invariant has no single state name or complete migration path.
  - Source that should survive: projects may exist before repositories.
  - Correction: define one canonical representation—such as repositoryStatus=NONE with nullable URL—and list the nullable-column/index migration and feature behavior explicitly.
  - Consolidation: Blocks consolidation.

  ### H12 — MVP AI scope and authority are still contradictory

  - Location: docs/product-brief.md:69, docs/prd.md:101, docs/prd.md:154, docs/epics-and-stories.md:44, docs/epics-and-stories.md:85.
  - Conflict: the brief says one advisory fit-analysis feature is the MVP AI surface. The PRD makes both LLM skill inference and fit analysis MVP, adds an optional narrative call,
    and retains STRICT screening even though root spec.md puts strict screening outside MVP.

  - Why it matters: this creates at least two AI product capabilities plus a migration of an existing AI deployment, while allowing an AI result to alter submission friction and
    prominence.

  - Source that should survive: advisory fit analysis only, with applications always reaching the owner.
  - Correction: remove STRICT from MVP; keep deterministic/self-declared skills and defer LLM skill inference unless the rubric decision requires it.
  - Consolidation: Blocks consolidation.

  ### H13 — Delivery scope is not credible for the deadline

  - Location: docs/product-brief.md:74, docs/epics-and-stories.md:12, docs/epics-and-stories.md:104.
  - Risky statement: approximately 55 stories are presented for six people by 2026-08-30, while the frontend is a three-file scaffold with no functioning test script and much of the
    backend loop is absent.

  - Additional contradiction: E2 creates the first task, but the sequencing note says E2 depends on E1 already providing a discoverable task.
  - Why it matters: blind reviews, scheduled expiry, flags, AI migration, immutable reputation, a new frontend, accessibility, seed recruitment, and validation cannot responsibly be
    treated as one ordinary delivery plan.

  - Source that should survive: one complete contribution loop and public profile.
  - Correction: define a vertical-slice plan: manual/no-AI loop first, public profile second, advisory fit third. Cut strict mode, admin skill review, optional AI, and nonessential
    collaboration before starting.

  - Consolidation: Blocks consolidation.

  ### H14 — Archived content still contains unique required safety and integrity rules

  - Location: docs/migration-notes.md:70, docs/archive/ShareK_Master_Product_and_Technical_Brief_v2.md:504, docs/archive/ShareK_Master_Product_and_Technical_Brief_v2.md:1274, docs/
    archive/ShareK_Master_Product_and_Technical_Brief_v2.md:1899.

  - Unique information omitted from canonical docs includes repository ownership verification, GitHub snapshot freshness, repeated-pair weighting, new-account trust weighting,
    review-ring detection, secret redaction, permission-aware retrieval, data retention, and prohibiting provider training without consent.

  - Why it matters: declaring the archive “never authoritative” silently drops controls that remain necessary under the new product direction.
  - Source that should survive: these security, privacy, authorship, and anti-manipulation rules.
  - Correction: extract the surviving rules into PRD NFRs, architecture, domain model, and test strategy before treating the remainder as historical.
  - Consolidation: Blocks consolidation.

  ### H15 — Email verification and User.status migration guidance are contradictory

  - Location: docs/architecture.md:102, docs/architecture.md:117, docs/data-model-and-erd.md:37, docs/api-contracts.md:62.
  - Conflict: architecture correctly concludes pending is email verification, then calls it a load-bearing pending gate that must be removed. The target model removes it entirely.
  - Why it matters: implementers cannot tell whether email verification remains, becomes a timestamp, or disappears.
  - Source that should survive: no admin-approval account gate; email verification is a separate security concern.
  - Correction: preserve verification explicitly—preferably emailVerifiedAt or a separate verification lifecycle—while keeping access policy independent of admin skill review.
  - Consolidation: Blocks consolidation.

  ## MEDIUM findings

  ### M1 — Implementation statuses are based on folder existence rather than behavior

  - Location: docs/architecture.md:36, docs/prd.md:132, docs/prd.md:180, docs/prd.md:209.
  - Risky statement: contribution-tasks, delivery-reviews, and admin are IN_DEVELOPMENT.
  - Repository evidence: each contains only an empty Nest module and planned README. Conversely, password reset has a service, endpoints, migration, and tests but E1-03 is PROPOSED.
  - Why it matters: the status vocabulary is not reliable for planning or reporting.
  - Source that should survive: repository evidence for current state; PRD status for target approval.
  - Correction: use PROPOSED for scaffold-only modules and a capability-level evidence table for implemented behavior.
  - Consolidation: Blocks consolidation.

  ### M2 — Source precedence and ADR placement create duplicate authority

  - Location: docs/README.md:55, docs/AGENTS.md:61, docs/adr/README.md:3.
  - Conflict: README gives one precedence order while docs/AGENTS.md gives another. ADR-002 is declared active but resides under an archive README calls “never authoritative.”
  - Why it matters: a developer cannot determine whether PRD or ADR wins, or whether ADR-002 is current.
  - Source that should survive: one precedence policy in docs/AGENTS.md; active ADRs must live in the active ADR directory.
  - Correction: make README link to the policy instead of restating it, and move/copy ADR-002 into the active ADR set with explicit lineage.
  - Consolidation: Blocks consolidation.

  ### M3 — The Postman guide mixes current endpoints with unbuilt target behavior

  - Location: docs/postman-api-guide.md:488.
  - Risky statement: admin review of a generated skill relabels AI_INFERRED to ADMIN_REVIEWED.
  - Why it matters: the current schema has SkillProfile.status, not the target evidence-state model, and the admin module has no controller or service. A current-runtime test guide
    should not tell testers an unbuilt workflow exists.

  - Source that should survive: Postman guide as current implementation documentation; PRD/API target docs for future behavior.
  - Correction: document only current generation states in Postman and link to the target gap.
  - Consolidation: Blocks consolidation.

  ### M4 — The frontend testing strategy does not test the highest-risk user-visible behavior

  - Location: docs/frontend-spec.md:71, docs/test-strategy.md:31.
  - Risky statement: helper-only Vitest tests, with no rendering or mocked HTTP layer by default, are sufficient.
  - Why it matters: public accessibility, auth-free routing, evidence links, unsafe-link rendering, blind visibility, keyboard behavior, and frontend/backend integration cannot be
    proven at a helper seam. The current frontend does not even have a usable test script.

  - Source that should survive: focused logic tests.
  - Correction: add one browser-level critical-loop test and focused component/route tests for the public profile, authentication boundary, evidence labels, and accessibility.
  - Consolidation: does not block the product model alone, but must be corrected before implementation.

  ### M5 — Project comments are specified without a domain entity or API

  - Location: docs/frontend-spec.md:18, docs/data-model-and-erd.md:57, docs/api-contracts.md:164.
  - Conflict: project detail promises comments, while only TaskComment and task-comment endpoints exist.
  - Why it matters: this is an untracked collaboration feature and another source of scope growth.
  - Source that should survive: task-scoped flat comments.
  - Correction: remove project comments from MVP or explicitly model them; removal is the proportionate choice.
  - Consolidation: does not block alone.

  ## LOW findings

  ### L1 — Domain instructions assert a documentation layout that does not exist

  - Location: docs/agents/domain.md:7, root CLAUDE.md.
  - Risky statement: CONTEXT-MAP.md, backend/frontend CONTEXT.md, and context ADR directories are treated as the multi-context model, but none exists. Agents are instructed to
    ignore their absence silently.

  - Why it matters: engineers may believe they consumed domain vocabulary when no glossary exists.
  - Source that should survive: the current canonical domain model until context files are actually created.
  - Correction: point these instructions at the real documents or mark the layout as proposed.
  - Consolidation: does not block alone.

  ### L2 — Counts and implementation facts are imprecise

  - Location: docs/README.md:10, docs/adr/adr-004-prisma-6.md:5.
  - Risky statements: “51 functional requirements” actually means 41 requirements numbered through FR-51 with gaps; ADR-004 claims 11 migrations, while 10 migration files exist.
  - Why it matters: this weakens traceability claims in a consolidation intended to be evidence-driven.
  - Source that should survive: actual counts or explicitly reserved ranges.
  - Correction: use accurate counts and distinguish highest requirement ID from requirement count.
  - Consolidation: does not block alone.

  ### L3 — Raw interview material is in the wrong category

  - Location: docs/Sharek_questions.txt, docs/AGENTS.md:48.
  - Risky placement: the 145-question input is left at the canonical docs root even though the governance file defines reference/ for this kind of material.
  - Why it matters: it visually competes with canonical sources despite being raw input.
  - Source that should survive: the interview as reference/history.
  - Correction: place it under docs/reference/ during consolidation and link it from the decision log.
  - Consolidation: does not block alone.

  ## Executive verdict

  Salvageable after major corrections.

  The central product direction is substantially better than the archived AI-gated marketplace: beginner-first, one evidence-backed contribution loop, contextual capabilities,
  public profiles, repository-optional projects, links-only evidence, advisory AI, no subscriptions, no chat, TanStack Start, NestJS, and PostgreSQL.

  The branch is not ready to consolidate because its authority, security claims, domain state machines, implementation statuses, workflow references, and delivery assumptions are
  not dependable yet.

  ## Stop-doing list

  - Stop marking generated documents and ADRs APPROVED without a human decision record.
  - Stop treating a module folder as evidence that a feature is in development.
  - Stop describing contributor OAuth as public/read-only.
  - Stop allowing staff to act as upstream maintainers merely by importing a public repository.
  - Stop calling arbitrary owner-approved links “verified contributions.”
  - Stop carrying STRICT screening and multiple LLM features in the MVP while claiming one advisory AI surface.
  - Stop designing a one-implementation port that violates the repository’s architecture rules.
  - Stop deleting implementation history before updating every live consumer and checker.
  - Stop archiving institutional requirements and safety controls without deciding whether they remain binding.
  - Stop planning horizontal infrastructure epics before one thin end-to-end contribution loop works.

  ## Safe-to-keep list

  - Beginner contributor as the primary MVP user.
  - One account that may own one project and contribute to another.
  - GitHub as authoritative for connected code.
  - Projects that can exist before a repository.
  - Owner accountability for acceptance decisions.
  - Mandatory individual contribution evidence.
  - Public profiles accessible without login.
  - Evidence links and visible evidence strength/status.
  - Blind reviews published when both submit or the window expires.
  - Links-only evidence for MVP.
  - No subscriptions, real payments, chat, WebSockets, or file storage.
  - SQL-filter discovery; no semantic search for MVP.
  - Advisory-only AI with visible uncertainty and citations.
  - TanStack Start frontend, NestJS modular backend, Prisma/PostgreSQL, BullMQ where justified.
  - Append-only reputation events with audited invalidation.
  - Sample sizes and raw reviews rather than a misleading universal score.
  - Archived legacy material as history once surviving controls are extracted.

  ## Documents that require human decisions

  - Whether the ITI AI checklist is binding and which requirements are mandatory.
  - Whether AI remains in the existing FastAPI service or moves in-process to NestJS.
  - Whether LLM skill inference is MVP or only advisory application fit remains.
  - Whether any strict-screening mode belongs in MVP.
  - The exact definition of a “verified contribution,” especially for repository-free and owner-attested work.
  - How repository ownership or maintainer authorization is proven.
  - Whether tasks support one contributor or multiple independent assignments.
  - How skill evidence represents both demonstrated and admin-reviewed facts.
  - The email-verification model after removing fixed account roles.
  - The public-profile API route.
  - Review-window duration, rating scale, and extreme-rating threshold.
  - Which external evidence types can create reputation without additional moderation.
  - The smallest deliverable scope feasible by 2026-08-30.

  ## Recommended consolidation strategy

  1. Freeze this branch as an audit checkpoint and mark the generated canonical set PROPOSED.
  2. Create a short human-approved decision log resolving the items above.
  3. Separate documentation into:
      - Target product requirements.
      - Target domain model and state machines.
      - Current repository behavior.
      - Explicit implementation-gap matrix.

  4. Rebuild the domain model around one narrow vertical slice: one owner, one task, one accepted contributor, versioned evidence, owner verdict, reputation event, public profile.
  5. Resolve trust before reputation: repository authority, evidence attribution, collusion controls, and owner-attested evidence tiers.
  6. Choose one AI deployment boundary and update all architecture instructions, runtime guides, module docs, environment contracts, and enforcement together.
  7. Make generated/current OpenAPI the implementation contract; keep proposed endpoint deltas separately. Derive Postman from the current contract.
  8. Restore the tracker as history or replace it atomically across every active consumer and checker.
  9. Move active ADR-002 out of the historical archive, extract unique safety rules from the v2 brief, and classify the ITI checklist as an external constraint.
  10. Re-plan delivery as vertical milestones, with the manual contribution loop and public profile before AI, bilateral reviews, or supporting collaboration.
