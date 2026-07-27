# Share-k — Full Project Backlog
## Team Role Summary

| Member | Role Label | General Responsibilities across all 8 sprints |
|---|---|---|
| M1 | M1 — UI/UX & Testing | Designs all screens and flows, defines accessibility and bilingual UX expectations, writes and runs unit, integration, and E2E tests across the platform. |
| M2 | M2 — AI Engineer | Selects models and APIs, implements all LangChain/LangGraph agents, owns LLM, RAG, Pinecone, AI validation, matching, skill-gap guidance, and AI inter-service contracts. |
| M3 | M3 — Frontend & Integration | Implements all Next.js pages and components, connects UI flows to backend REST APIs, and owns the frontend-to-backend contract. |
| M4 | M4 — Backend & Integration | Implements backend services, REST APIs, database schemas, GitHub integration endpoints, application workflows, and core business rules. |
| M5 | M5 — Backend & Integration | Works alongside M4 on backend services, owns deployment infrastructure, CI/CD, cloud delivery on AWS, and production readiness. |
| M6 | M6 — DevOps & QA Automation | Owns Docker, GitHub Actions CI/CD pipeline support, Langfuse observability support, CloudWatch, Sentry, and automated testing infrastructure. |

**M6 Role Justification:** M1–M5 cover the core product lanes: UX/testing, AI, frontend integration, backend services, and backend/cloud delivery. The workload still has a cross-cutting need for repeatable local environments, automated test infrastructure, observability plumbing, and release support, especially in sprints 7–8. M6 is therefore assigned as **DevOps & QA Automation** so M5 can own AWS and CI/CD outcomes while M6 strengthens the automation, monitoring, and quality infrastructure around them.

---

## SPRINT 1 — Foundation Platform Setup
**Goal:** Establish authentication, optional GitHub integration, database foundations, Pinecone setup, and base UI scaffolding for Share-k.
**Duration:** Week 1

### Scrum Tasks

#### TASK-1-01 — Define Core UX Flows and Design System Baseline
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 5
- **Task breakdown:**
  1. Design the primary flows for registration.
  2. Design the optional profile-based GitHub App installation flow.
  3. Design the role selection flow.
  4. Design the project publishing flow.
  5. Design the project discovery flow.
  6. Design the task application flow.
  7. Acceptance: screen-level wireframes.
  8. Acceptance: reusable UI states.
  9. Acceptance: accessibility notes.
  10. Acceptance: WCAG 2.1 AA alignment.
  11. Acceptance: Arabic/English layout expectations.
- **Dependencies:** None
- **Sprint Goal Contribution:** Establishes the UX blueprint that frontend and backend work will implement throughout the MVP.

#### TASK-1-02 — Implement Next.js App Shell and Shared UI Components
- **Type:** Story
- **Priority:** High
- **Assigned To:** M3 — Frontend & Integration
- **Story Points:** 5
- **Task breakdown:**
  1. Build the Next.js app shell.
  2. Implement navigation structure.
  3. Implement route structure.
  4. Authentication-aware layout placeholders.
  5. Implement shared components.
  6. Add form, feed, card, and status badge components.
  7. Acceptance: responsive owner views.
  8. Acceptance: responsive contributor views.
  9. Acceptance: responsive admin views.

- **Dependencies:** TASK-1-01
- **Sprint Goal Contribution:** Provides the frontend scaffold needed for all role-based Share-k workflows.

#### TASK-1-03 — Configure Database Schema Foundation
- **Type:** Story
- **Priority:** High
- **Assigned To:** M4 — Backend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Create initial database schemas for users.
  2. Create roles schema.
  3. Create GitHub accounts schema.
  4. Create projects schema.
  5. Create contribution requests schema.
  6. Create applications schema.
  7. Create skill profiles schema.
  8. Create subscriptions schema.
  9. Create delivery reviews schema.
  10. Create reports schema.
  11. Create reputation records schema.
  12. Acceptance: migrations that preserve relationships needed by the locked PRD workflows.

- **Dependencies:** None
- **Sprint Goal Contribution:** Creates the persistent data model for auth, GitHub data, project publishing, applications, and reputation.

#### TASK-1-04 — Implement Auth and GitHub Identity Backend
- **Type:** Story
- **Priority:** High
- **Assigned To:** M4 — Backend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement registration.
  2. Implement login and session handling.
  3. Implement role assignment.
  4. Keep optional GitHub sign-in identity separate from repository access.
  5. Support project owners.
  6. Support contributors.
  7. Acceptance: registration and profile access do not require GitHub.
  8. Acceptance: optional GitHub identity linkage is stored separately from repository installation access.
  9. Acceptance: support later ingestion and repository import.

- **Dependencies:** TASK-1-03
- **Sprint Goal Contribution:** Delivers independent identity registration and optional GitHub identity linkage without coupling registration to repository analysis.

#### TASK-1-05 — Configure GitHub API Ingestion Service Foundation
- **Type:** Story
- **Priority:** High
- **Assigned To:** M5 — Backend & Integration
- **Story Points:** 5
- **Task breakdown:**
  1. Build reusable backend service functions for fetching GitHub repositories.
  2. Fetch README content.
  3. Fetch language data.
  4. Fetch contribution activity.
  5. Fetch commit signals.
  6. Fetch repository descriptions.
  7. Fetch repository statistics where available.
  8. Acceptance: normalized outputs that can be consumed by project publishing and AI skill profiling.

- **Dependencies:** TASK-1-04
- **Sprint Goal Contribution:** Enables Share-k to derive both project metadata and contributor skill evidence from GitHub.

#### TASK-1-06 — Initialize AI, RAG, and Pinecone Contracts
- **Type:** Task
- **Priority:** High
- **Assigned To:** M2 — AI Engineer
- **Story Points:** 8
- **Task breakdown:**
  1. Select the LLM.
  2. Select the embedding approach.
  3. Select the LangChain/LangGraph approach.
  4. Select the Pinecone integration approach.
  5. Define AI agent input contracts.
  6. Define AI agent output contracts.
  7. Acceptance: structured schemas for AI outputs.
  8. Acceptance: source attribution fields.
  9. Acceptance: confidence scoring.
  10. Acceptance: failure handling paths.

- **Dependencies:** TASK-1-05
- **Sprint Goal Contribution:** Establishes the AI Trinity foundation before agent implementation begins.

#### TASK-1-07 — Create Local Development and Docker Baseline
- **Type:** Task
- **Priority:** Medium
- **Assigned To:** M6 — DevOps & QA Automation
- **Story Points:** 3
- **Task breakdown:**
  1. Create Docker-based local development setup for the app.
  2. Include API service in Docker setup.
  3. Include database service in Docker setup.
  4. Supporting services needed by the MVP.
  5. Acceptance: documented startup path.
  6. Acceptance: environment variable template.
  7. Acceptance: usable by local contributors.

- **Dependencies:** TASK-1-03
- **Sprint Goal Contribution:** Makes the foundation reproducible for all team members before feature work accelerates.

---

## SPRINT 2 — Onboarding, Admin Review, and Project Publishing
**Goal:** Complete profile-based skill status, pending AI skill review support, and owner project publication from GitHub metadata.
**Duration:** Week 2

### Scrum Tasks

#### TASK-2-01 — Design Onboarding, Admin Review, and Project Publishing Screens
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 5
- **Task breakdown:**
  1. Design detailed profile states for optional contributor skill generation.
  2. Design GitHub ingestion status screen.
  3. Design pending skill profile review screen.
  4. Design admin skill adjustment screen.
  5. Design repository URL submission screen.
  6. Design metadata review screen.
  7. Design project publication screen.
  8. Acceptance: clear empty.
  9. Acceptance: loading.
  10. Acceptance: pending.
  11. Acceptance: approved.
  12. Acceptance: rejected.
  13. Acceptance: error states.

- **Dependencies:** TASK-1-01
- **Sprint Goal Contribution:** Defines the user experience for activation, trust review, and first owner publishing.

#### TASK-2-02 — Build Onboarding and Project Publishing Frontend
- **Type:** Story
- **Priority:** High
- **Assigned To:** M3 — Frontend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement contributor GitHub App installation and repository-selection screens inside the normal profile experience.
  2. Implement profile skill-generation status views.
  3. Implement owner repository URL submission.
  4. Implement metadata review/edit form.
  5. Implement project publication UI.
  6. Acceptance: frontend integration with auth.
  7. Acceptance: GitHub metadata integration.
  8. Acceptance: project publication APIs.

- **Dependencies:** TASK-2-01, TASK-1-02, TASK-1-04
- **Sprint Goal Contribution:** Gives users independent registration, optional profile-based GitHub skill analysis, and project-publishing workflows.

#### TASK-2-03 — Implement Project Metadata Fetch and Publication APIs
- **Type:** Story
- **Priority:** High
- **Assigned To:** M4 — Backend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement APIs for submitting a GitHub repository URL.
  2. Fetch repository title.
  3. Fetch repository description.
  4. Fetch repository languages.
  5. Fetch repository tags.
  6. Fetch repository technologies.
  7. Fetch repository statistics.
  8. Saving owner-reviewed metadata as unpublished or published.
  9. Acceptance: projects to remain hidden until the owner confirms publication.

- **Dependencies:** TASK-1-05
- **Sprint Goal Contribution:** Delivers the backend path for GitHub-based project publishing.

#### TASK-2-04 — Implement Admin Skill Review Backend
- **Type:** Story
- **Priority:** High
- **Assigned To:** M5 — Backend & Integration
- **Story Points:** 5
- **Task breakdown:**
  1. Implement admin APIs to list pending AI-generated skills.
  2. Implement approve skills action.
  3. Implement reject skills action.
  4. Implement proficiency label adjustment.
  5. Store admin review decisions.
  6. Acceptance: pending or rejected skills to be excluded from eligibility decisions.

- **Dependencies:** TASK-1-03
- **Sprint Goal Contribution:** Adds the trust gate required before AI-generated skill claims can affect applications.

#### TASK-2-05 — Implement RAG Indexing for GitHub and Project Metadata
- **Type:** Story
- **Priority:** High
- **Assigned To:** M2 — AI Engineer
- **Story Points:** 8
- **Task breakdown:**
  1. Implement ingestion into Pinecone for GitHub README content.
  2. Index code evidence summaries.
  3. Index commit messages where available.
  4. Fetch repository descriptions.
  5. Index contributor profile evidence.
  6. Index published project metadata.
  7. Acceptance: retrievable source attribution for skill extraction and semantic project discovery.

- **Dependencies:** TASK-1-06, TASK-1-05, TASK-2-03
- **Sprint Goal Contribution:** Makes retrieved evidence available for AI-backed profiling and discovery.

#### TASK-2-06 — Write Sprint 2 Unit and Integration Tests
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 5
- **Task breakdown:**
  1. Write Sprint 2 tests.
  2. Run tests for auth-aware profile skill states and repository-free profile access.
  3. Test project metadata review behavior.
  4. Test admin skill review API behavior.
  5. Test pending skill exclusion rules.
  6. Acceptance: passing tests for the new frontend flows and backend endpoints.

- **Dependencies:** TASK-2-02, TASK-2-03, TASK-2-04
- **Sprint Goal Contribution:** Verifies that optional skill profiling, publication, and admin review foundations behave correctly.

#### TASK-2-07 — Add API Contract Checks for Frontend Integration
- **Type:** Task
- **Priority:** Medium
- **Assigned To:** M6 — DevOps & QA Automation
- **Story Points:** 3
- **Task breakdown:**
  1. Add automated contract checks or schema validation.
  2. Cover auth endpoints.
  3. Cover GitHub metadata endpoints.
  4. Cover project publication endpoints.
  5. Cover admin skill review endpoints.
  6. Acceptance: CI-runnable checks.
  7. Acceptance: catch response shape drift.
  8. Acceptance: protect frontend integration.

- **Dependencies:** TASK-2-03, TASK-2-04
- **Sprint Goal Contribution:** Stabilizes the integration contract between frontend and backend for foundation workflows.

---

## SPRINT 3 — Skill Profiling Agent and Discovery Foundation
**Goal:** Generate reviewable AI skill profiles from GitHub evidence and expose published projects through structured and semantic discovery.
**Duration:** Week 3

### Scrum Tasks

#### TASK-3-01 — Design Skill Profile and Discovery Experience
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 5
- **Task breakdown:**
  1. Design contributor skill profile screens.
  2. Design evidence attribution display.
  3. Design admin review refinements.
  4. Design project discovery feed.
  5. Design discovery filters.
  6. Include technology stack filters.
  7. Include category filters.
  8. Include difficulty filters.
  9. Acceptance: Beginner proficiency label.
  10. Acceptance: Intermediate proficiency label.
  11. Acceptance: Advanced proficiency label.
  12. Acceptance: trust-oriented evidence presentation.

- **Dependencies:** TASK-2-01
- **Sprint Goal Contribution:** Defines how users see AI-generated skills and discover published projects.

#### TASK-3-02 — Implement Skill Profiling Agent
- **Type:** Story
- **Priority:** High
- **Assigned To:** M2 — AI Engineer
- **Story Points:** 8
- **Task breakdown:**
  1. Implement the GitHub Ingestion and Skill Profiling Agent.
  2. Use retrieved GitHub evidence.
  3. Return skill name in agent output.
  4. Return proficiency level in agent output.
  5. Return confidence in agent output.
  6. Return evidence source in agent output.
  7. Acceptance: structured output.
  8. Acceptance: source attribution.
  9. Acceptance: low-confidence handling.
  10. Acceptance: pending-state persistence handoff.

- **Dependencies:** TASK-2-05, TASK-2-04
- **Sprint Goal Contribution:** Delivers the first core AI agent required for contributor activation.

#### TASK-3-03 — Persist Skill Profile Generation Results
- **Type:** Story
- **Priority:** High
- **Assigned To:** M4 — Backend & Integration
- **Story Points:** 5
- **Task breakdown:**
  1. Add backend orchestration to trigger skill profiling only after an authenticated contributor selects repositories from an active GitHub App installation, consents to analysis, and explicitly starts generation; persist generated skills in pending state.
  2. Acceptance: generated skills to remain unavailable for task eligibility until admin approval.

- **Dependencies:** TASK-3-02, TASK-2-04
- **Sprint Goal Contribution:** Connects the AI profiling result to the platform trust workflow.

#### TASK-3-04 — Build Skill Profile and Admin Review Frontend
- **Type:** Story
- **Priority:** High
- **Assigned To:** M3 — Frontend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement contributor skill profile views and admin review screens.
  2. Show proficiency in the UI.
  3. Show confidence in the UI.
  4. Show evidence sources in the UI.
  5. Add approve action.
  6. Add reject action.
  7. Add adjust action.
  8. Acceptance: successful integration with pending skill APIs.
  9. Acceptance: successful integration with reviewed skill APIs.

- **Dependencies:** TASK-3-01, TASK-3-03, TASK-2-04
- **Sprint Goal Contribution:** Gives contributors and admins usable access to AI-generated skill profiles.

#### TASK-3-05 — Implement Project Discovery APIs
- **Type:** Story
- **Priority:** High
- **Assigned To:** M5 — Backend & Integration
- **Story Points:** 5
- **Task breakdown:**
  1. Implement APIs for published project listing.
  2. Add filtering by technology stack.
  3. Add category filtering.
  4. Add difficulty filtering.
  5. Return indexed metadata for semantic discovery.
  6. Acceptance: unpublished projects to be excluded from contributor discovery.

- **Dependencies:** TASK-2-03, TASK-2-05
- **Sprint Goal Contribution:** Provides the backend data feed for contributor project browsing.

#### TASK-3-06 — Build Project Discovery Frontend
- **Type:** Story
- **Priority:** High
- **Assigned To:** M3 — Frontend & Integration
- **Story Points:** 5
- **Task breakdown:**
  1. Implement technology filtering in the discovery feed.
  2. Add category filtering.
  3. Add difficulty filters.
  4. Acceptance: contributors to narrow listings and view enough technology and difficulty information to assess fit.

- **Dependencies:** TASK-3-01, TASK-3-05
- **Sprint Goal Contribution:** Makes published projects discoverable to contributors.

#### TASK-3-07 — Test Skill Profiling and Discovery Workflows
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 5
- **Task breakdown:**
  1. Write skill profiling tests.
  2. Run tests for skill profile pending state.
  3. Test admin approval effects.
  4. Test evidence display.
  5. Test discovery filters.
  6. Test unpublished project exclusion.
  7. Acceptance: tests covering both API behavior and user-visible flows.

- **Dependencies:** TASK-3-03, TASK-3-04, TASK-3-06
- **Sprint Goal Contribution:** Confirms that AI-generated skills and project discovery meet trust and usability requirements.

---

## SPRINT 4 — Contribution Requests and AI Validation Gate
**Goal:** Enable owners to publish contribution requests and gate contributor applications through AI validation before owner review.
**Duration:** Week 4

### Scrum Tasks

#### TASK-4-01 — Design Contribution Request and Application Gate Flows
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 5
- **Task breakdown:**
  1. Design owner contribution request creation.
  2. Design task feed browsing flow.
  3. Design application submission flow.
  4. Design eligible application forwarding.
  5. Design ineligible rejection messaging.
  6. Design contributor dispute entry points.
  7. Acceptance: visible states for AI validation pending.
  8. Acceptance: visible state for eligible applications.
  9. Acceptance: visible state for ineligible applications.
  10. Acceptance: visible state for low-confidence validation.
  11. Acceptance: review-needed outcomes.

- **Dependencies:** TASK-3-01
- **Sprint Goal Contribution:** Defines the UX for Share-k's core AI-gated application differentiator.

#### TASK-4-02 — Implement Contribution Request Backend APIs
- **Type:** Story
- **Priority:** High
- **Assigned To:** M4 — Backend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement create contribution request API.
  2. Implement publish contribution request action.
  3. Implement edit contribution request action.
  4. Manage contribution requests linked to published projects.
  5. Acceptance: request title is stored.
  6. Acceptance: request description is stored.
  7. Acceptance: required technologies are stored.
  8. Acceptance: difficulty level is stored.
  9. Acceptance: deadline is stored.
  10. Acceptance: optional reward is stored.
  11. Acceptance: publication state is stored.
  12. Acceptance: owner monthly order limit checks.

- **Dependencies:** TASK-2-03, TASK-1-03
- **Sprint Goal Contribution:** Enables owners to define structured tasks that contributors can apply to.

#### TASK-4-03 — Build Contribution Request and Task Feed Frontend
- **Type:** Story
- **Priority:** High
- **Assigned To:** M3 — Frontend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement owner contribution request management screens and contributor task feed views.
  2. Acceptance: contributors can view task requirements before applying.
  3. Acceptance: owners can manage requests.
  4. Acceptance: requests stay linked to published projects.

- **Dependencies:** TASK-4-01, TASK-4-02
- **Sprint Goal Contribution:** Makes contribution opportunities visible and manageable in the UI.

#### TASK-4-04 — Implement Skill Validation Agent
- **Type:** Story
- **Priority:** High
- **Assigned To:** M2 — AI Engineer
- **Story Points:** 8
- **Task breakdown:**
  1. Implement the Skill Validation Agent that compares contribution request requirements.
  2. Compare against approved contributor skills.
  3. Acceptance: eligibility decision.
  4. Acceptance: confidence score.
  5. Acceptance: justification is returned.
  6. Acceptance: source attribution.
  7. Acceptance: low-confidence failure handling.
  8. Acceptance: unsupported decision failure handling.

- **Dependencies:** TASK-3-02, TASK-4-02
- **Sprint Goal Contribution:** Delivers the AI gate that prevents unsuitable applications from reaching owners.

#### TASK-4-05 — Implement AI-Gated Application Workflow
- **Type:** Story
- **Priority:** High
- **Assigned To:** M5 — Backend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement application submission orchestration that invokes AI validation.
  2. Forwards eligible applications to owners.
  3. Block ineligible applications.
  4. Record validation decisions.
  5. Acceptance: unapproved skill claims never qualify a contributor.
  6. Acceptance: low-confidence skill claims never qualify a contributor.
  7. Acceptance: disputed skill claims never silently qualify a contributor.

- **Dependencies:** TASK-4-04, TASK-4-02, TASK-3-03
- **Sprint Goal Contribution:** Connects contributor applications to the validation gate and owner review queue.

#### TASK-4-06 — Implement Owner Application Review Frontend
- **Type:** Story
- **Priority:** High
- **Assigned To:** M3 — Frontend & Integration
- **Story Points:** 5
- **Task breakdown:**
  1. Build owner screens to view AI-prevalidated applications.
  2. Show eligibility justification for inspection.
  3. Add accept/reject actions for eligible applicants.
  4. Acceptance: owners to see only eligible applications unless a review or admin override path explicitly permits otherwise.

- **Dependencies:** TASK-4-03, TASK-4-05
- **Sprint Goal Contribution:** Completes the owner-facing side of AI-gated applications.

#### TASK-4-07 — Test AI-Gated Application Flow
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 8
- **Task breakdown:**
  1. Write and run integration and E2E tests for applying to tasks.
  2. Design eligible application forwarding.
  3. Test ineligible blocking.
  4. Test owner accept/reject behavior.
  5. Test low-confidence handling.
  6. Test pending skill exclusion.
  7. Acceptance: tests proving project owners do not receive applications that fail AI validation.

- **Dependencies:** TASK-4-05, TASK-4-06
- **Sprint Goal Contribution:** Verifies the MVP's central trust and qualification workflow.

---

## SPRINT 5 — Delivery Review, Reputation, and Skill Gap Guidance
**Goal:** Complete contribution delivery review, reputation updates, and Gold-tier skill-gap guidance for rejected contributors.
**Duration:** Week 5

### Scrum Tasks

#### TASK-5-01 — Design Delivery Review, Reputation, and Skill Gap Screens
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 5
- **Task breakdown:**
  1. Design accepted contributor delivery screens.
  2. Design GitHub pull request link submission.
  3. Design owner approval/rejection flow.
  4. Design ratings capture.
  5. Design feedback capture.
  6. Design public reputation profile.
  7. Design Gold-tier rejection guidance.
  8. Acceptance: clear status progression from application through completion and reputation update visibility.

- **Dependencies:** TASK-4-01
- **Sprint Goal Contribution:** Defines the UX for contribution completion and contributor growth feedback.

#### TASK-5-02 — Implement Contribution Delivery and Review Backend
- **Type:** Story
- **Priority:** High
- **Assigned To:** M4 — Backend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement PR link submission API.
  2. Support accepted contributors.
  3. Implement owner approve action.
  4. Implement owner reject action.
  5. Acceptance: application status updates.
  6. Acceptance: acceptance status updates.
  7. Acceptance: delivery status updates.
  8. Acceptance: review status updates.
  9. Acceptance: completion status updates.

- **Dependencies:** TASK-4-05
- **Sprint Goal Contribution:** Enables accepted work to move from assignment to verified completion.

#### TASK-5-03 — Build Delivery Review Frontend
- **Type:** Story
- **Priority:** High
- **Assigned To:** M3 — Frontend & Integration
- **Story Points:** 5
- **Task breakdown:**
  1. Implement contributor delivery submission views and owner delivery review screens.
  2. Acceptance: PR link submission.
  3. Acceptance: review status display.
  4. Acceptance: approve/reject actions.
  5. Acceptance: owner feedback capture.

- **Dependencies:** TASK-5-01, TASK-5-02
- **Sprint Goal Contribution:** Gives contributors and owners the interface needed to complete contribution work.

#### TASK-5-04 — Implement Reputation Calculation and Profile APIs
- **Type:** Story
- **Priority:** High
- **Assigned To:** M5 — Backend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement contributor reputation profile APIs based on approved contributions.
  2. Include owner ratings in reputation API.
  3. Include completed count in reputation API.
  4. Include success rate in reputation API.
  5. Include top verified skills in reputation API.
  6. Acceptance: only approved contribution outcomes and owner ratings to affect reputation metrics.

- **Dependencies:** TASK-5-02, TASK-3-03
- **Sprint Goal Contribution:** Turns verified platform activity into a reputation signal for future selection and matching.

#### TASK-5-05 — Implement Skill Gap Guidance Agent
- **Type:** Story
- **Priority:** High
- **Assigned To:** M2 — AI Engineer
- **Story Points:** 8
- **Task breakdown:**
  1. Implement the Skill Gap Guidance Agent for Gold-tier contributors rejected by AI validation.
  2. Acceptance: missing skills are identified.
  3. Acceptance: recommended technologies are included.
  4. Acceptance: suggested learning resources are included.
  5. Acceptance: practice projects are included.
  6. Acceptance: estimated improvement path where available.
  7. Acceptance: streamed response support.
  8. Acceptance: source attribution when evidence exists.

- **Dependencies:** TASK-4-04, TASK-2-05
- **Sprint Goal Contribution:** Adds actionable AI guidance for premium rejected contributors.

#### TASK-5-06 — Build Reputation Profile Frontend
- **Type:** Story
- **Priority:** Medium
- **Assigned To:** M3 — Frontend & Integration
- **Story Points:** 5
- **Task breakdown:**
  1. Implement public contributor reputation profile views.
  2. Show overall rating.
  3. Show completed contribution count.
  4. Show success rate.
  5. Show top verified skills.
  6. Acceptance: reputation data reflects verified outcomes.
  7. Acceptance: reputation avoids self-declared skills only.

- **Dependencies:** TASK-5-01, TASK-5-04
- **Sprint Goal Contribution:** Makes verified contributor reputation visible for owner selection and platform trust.

#### TASK-5-07 — Test Delivery, Reputation, and Guidance Workflows
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 8
- **Task breakdown:**
  1. Write tests for PR delivery submission.
  2. Run tests for PR delivery submission.
  3. Test owner review behavior.
  4. Test rating and feedback capture.
  5. Test contribution completion rules.
  6. Test reputation metric updates.
  7. Test Gold-only skill-gap guidance display.
  8. Acceptance: tests proving a contribution cannot count as completed until owner approval.

- **Dependencies:** TASK-5-03, TASK-5-04, TASK-5-05, TASK-5-06
- **Sprint Goal Contribution:** Confirms completion, reputation, and premium guidance behavior are correct.

---

## SPRINT 6 — Premium Tiers and Contributor Matching
**Goal:** Enforce owner and contributor premium limits while enabling AI contributor matching and premium task recommendations.
**Duration:** Week 6

### Scrum Tasks

#### TASK-6-01 — Design Premium Plan and Matching Experiences
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 5
- **Task breakdown:**
  1. Design plan status displays.
  2. Design owner order limit messaging.
  3. Design contributor daily application limit messaging.
  4. Design Silver/Gold matching surfaces.
  5. Design Gold recommended tasks surface.
  6. Design priority visibility indicators.
  7. Acceptance: plan benefits to be understandable at order creation.
  8. Acceptance: plan benefits are clear during application.
  9. Acceptance: plan benefits are clear during matching.
  10. Acceptance: plan benefits are clear in notifications.
  11. Acceptance: plan benefits are clear in guidance moments.

- **Dependencies:** TASK-5-01
- **Sprint Goal Contribution:** Defines how users understand and encounter premium limits and benefits.

#### TASK-6-02 — Implement Subscription Plan and Limit Enforcement Backend
- **Type:** Story
- **Priority:** High
- **Assigned To:** M4 — Backend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement owner Bronze order limits.
  2. Implement owner Silver order limits.
  3. Implement owner Gold order limits.
  4. Implement contributor Bronze application limits.
  5. Implement contributor Silver application limits.
  6. Implement contributor Gold application limits.
  7. Acceptance: premium status changes to affect future limits and benefits without corrupting existing contribution history.

- **Dependencies:** TASK-4-02, TASK-4-05
- **Sprint Goal Contribution:** Enforces the MVP premium tier business rules at the correct workflow points.

#### TASK-6-03 — Implement Contributor Matching Agent
- **Type:** Story
- **Priority:** High
- **Assigned To:** M2 — AI Engineer
- **Story Points:** 8
- **Task breakdown:**
  1. Implement the Contributor Matching Agent for Silver.
  2. Support Gold owner plans using approved skills.
  3. Use task requirements in matching.
  4. Use reputation signals in matching.
  5. Use retrieved evidence in matching.
  6. Acceptance: top 5 matches for Silver owners.
  7. Acceptance: top 10 matches for Gold owners.
  8. Acceptance: clear confidence/justification output.

- **Dependencies:** TASK-5-04, TASK-4-04, TASK-2-05
- **Sprint Goal Contribution:** Adds premium AI matching benefits for eligible project owners.

#### TASK-6-04 — Implement Premium Benefit APIs
- **Type:** Story
- **Priority:** High
- **Assigned To:** M5 — Backend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement APIs for owner priority visibility.
  2. Implement priority order visibility.
  3. Automatic notification eligibility for best-matching contributors.
  4. Contributor skill-matched notifications.
  5. Implement Gold AI-recommended tasks.
  6. Implement commission benefit flags.
  7. Acceptance: benefits to be exposed only to eligible plan tiers.

- **Dependencies:** TASK-6-02, TASK-6-03
- **Sprint Goal Contribution:** Connects plan enforcement to premium product benefits across the MVP.

#### TASK-6-05 — Build Premium and Matching Frontend
- **Type:** Story
- **Priority:** High
- **Assigned To:** M3 — Frontend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement premium plan displays.
  2. Implement usage limit messaging.
  3. Implement owner matching results view.
  4. Implement contributor task recommendations view.
  5. Implement Gold skill-gap guidance entry points.
  6. Acceptance: UI behavior matches backend plan eligibility.
  7. Acceptance: UI behavior matches AI matching outputs.

- **Dependencies:** TASK-6-01, TASK-6-04
- **Sprint Goal Contribution:** Gives users access to the premium tier workflows and AI matching benefits.

#### TASK-6-06 — Implement Report and Dispute Backend Paths
- **Type:** Story
- **Priority:** Medium
- **Assigned To:** M4 — Backend & Integration
- **Story Points:** 5
- **Task breakdown:**
  1. Implement lightweight admin/support APIs for reported issues and contributor review or dispute paths for inaccurate AI skill or validation outcomes.
  2. Acceptance: admins to review issues and prevent fraud.
  3. Acceptance: prevent misuse.
  4. Acceptance: prevent reputation manipulation.
  5. Acceptance: disputed claims never silently qualify contributors.

- **Dependencies:** TASK-2-04, TASK-4-05
- **Sprint Goal Contribution:** Completes the PRD trust-and-safety support paths around AI and reputation.

#### TASK-6-07 — Test Premium Limits, Matching, and Disputes
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 8
- **Task breakdown:**
  1. Write tests for owner monthly order limits.
  2. Run tests for owner monthly order limits.
  3. Test contributor daily application limits.
  4. Test Silver/Gold matching access.
  5. Test Gold-only guidance access.
  6. Test premium task recommendations.
  7. Test dispute/report behavior.
  8. Acceptance: premium benefits to be blocked for ineligible tiers and available for eligible tiers.

- **Dependencies:** TASK-6-02, TASK-6-04, TASK-6-05, TASK-6-06
- **Sprint Goal Contribution:** Verifies that premium business rules and trust paths work consistently.

---

## SPRINT 7 — Observability, Quality Hardening, and CI/CD
**Goal:** Harden the MVP with observability, automated quality gates, E2E coverage, and deployable CI/CD infrastructure.
**Duration:** Week 7

### Scrum Tasks

#### TASK-7-01 — UX Polish and Accessibility Audit
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 5
- **Task breakdown:**
  1. Audit core screens for WCAG 2.1 AA expectations.
  2. Audit Arabic/English layout readiness.
  3. Audit responsive behavior.
  4. Audit empty states.
  5. Audit error messaging.
  6. Acceptance: documented issues fixed or tracked before demo preparation.

- **Dependencies:** TASK-6-05
- **Sprint Goal Contribution:** Raises user-facing quality across the completed MVP flows.

#### TASK-7-02 — Implement Full E2E Test Suite
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 8
- **Task breakdown:**
  1. Write and run E2E tests covering registration.
  2. Design the optional profile-based GitHub App connection flow.
  3. Cover admin skill approval in E2E tests.
  4. Design the project publishing flow.
  5. Cover discovery in E2E tests.
  6. Cover contribution request creation in E2E tests.
  7. Cover AI-gated application in E2E tests.
  8. Cover delivery review in E2E tests.
  9. Cover reputation update in E2E tests.
  10. Cover premium limits in E2E tests.
  11. Acceptance: reliable automated coverage for the critical demo paths.

- **Dependencies:** TASK-7-01, TASK-6-07
- **Sprint Goal Contribution:** Provides confidence that the MVP works end to end.

#### TASK-7-03 — Add AI Observability and Quality Tracing
- **Type:** Story
- **Priority:** High
- **Assigned To:** M2 — AI Engineer
- **Story Points:** 8
- **Task breakdown:**
  1. Instrument AI agents with trace data for prompts.
  2. Capture retrieved sources in traces.
  3. Capture structured outputs in traces.
  4. Capture confidence scores in traces.
  5. Capture low-confidence outcomes in traces.
  6. Capture failure paths in traces.
  7. Acceptance: validation accuracy can be evaluated.
  8. Acceptance: RAG faithfulness can be evaluated.
  9. Acceptance: explainability without exposing unsupported trust decisions.

- **Dependencies:** TASK-6-03, TASK-5-05
- **Sprint Goal Contribution:** Makes AI behavior observable and reviewable before deployment.

#### TASK-7-04 — Harden Backend Performance and Failure Handling
- **Type:** Task
- **Priority:** High
- **Assigned To:** M4 — Backend & Integration
- **Story Points:** 5
- **Task breakdown:**
  1. Harden API behavior for retries.
  2. Harden validation error handling.
  3. Harden authorization checks.
  4. P95 response targets under 3 seconds for non-streaming core interactions.
  5. Acceptance: clear user-facing failure messages and no silent trust decisions when dependencies fail.

- **Dependencies:** TASK-6-06
- **Sprint Goal Contribution:** Improves reliability for the core backend workflows.

#### TASK-7-05 — Configure GitHub Actions CI/CD Pipeline
- **Type:** Task
- **Priority:** High
- **Assigned To:** M5 — Backend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Implement the GitHub Actions CI/CD pipeline for linting.
  2. Run tests.
  3. Run builds.
  4. Run environment validation.
  5. Prepare deployment configuration.
  6. Acceptance: pipeline runs automated checks.
  7. Acceptance: pipeline produces deployable artifacts.
  8. Acceptance: artifacts target the AWS environment.

- **Dependencies:** TASK-7-02, TASK-1-07
- **Sprint Goal Contribution:** Creates the automated delivery path required for production deployment.

#### TASK-7-06 — Build Automated Test Infrastructure and Reporting
- **Type:** Task
- **Priority:** High
- **Assigned To:** M6 — DevOps & QA Automation
- **Story Points:** 5
- **Task breakdown:**
  1. Configure automated test execution.
  2. Generate automated test reports.
  3. Generate coverage output.
  4. Generate failure artifacts.
  5. Support unit test suites.
  6. Support integration test suites.
  7. Support E2E test suites.
  8. Acceptance: developers can inspect failed test evidence.
  9. Acceptance: evidence is available from the CI run.

- **Dependencies:** TASK-7-02, TASK-7-05
- **Sprint Goal Contribution:** Makes quality checks repeatable and actionable across the team.

#### TASK-7-07 — Add Sentry and Runtime Error Monitoring
- **Type:** Task
- **Priority:** Medium
- **Assigned To:** M6 — DevOps & QA Automation
- **Story Points:** 5
- **Task breakdown:**
  1. Configure runtime error monitoring for frontend and backend services with release and environment tagging.
  2. Acceptance: capture errors in core user flows.
  3. Acceptance: include enough diagnostic context.

- **Dependencies:** TASK-7-05
- **Sprint Goal Contribution:** Adds operational visibility needed before deployment and demo.

---

## SPRINT 8 — AWS Deployment and Demo Readiness
**Goal:** Deploy Share-k to AWS, complete final verification, and prepare a stable capstone demo of the MVP.
**Duration:** Week 8

### Scrum Tasks

#### TASK-8-01 — Final Demo UX Pass and Scenario Script
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 5
- **Task breakdown:**
  1. Finalize demo-ready UX details and produce a scenario script.
  2. Cover owner flows.
  3. Cover contributor flows.
  4. Cover admin/support flows.
  5. Acceptance: script demonstrates optional GitHub App installation and explicit skill analysis from the profile.
  6. Acceptance: AI skill review.
  7. Acceptance: project publishing.
  8. Acceptance: AI-gated application.
  9. Acceptance: delivery review.
  10. Acceptance: reputation.
  11. Acceptance: premium behavior.

- **Dependencies:** TASK-7-01, TASK-7-02
- **Sprint Goal Contribution:** Turns the completed MVP into a coherent demo experience.

#### TASK-8-02 — Run Final Regression and Acceptance Testing
- **Type:** Task
- **Priority:** High
- **Assigned To:** M1 — UI/UX & Testing
- **Story Points:** 8
- **Task breakdown:**
  1. Run final unit tests.
  2. Run integration tests.
  3. E2E regression tests.
  4. Test against the release candidate.
  5. Acceptance: critical workflows pass.
  6. Acceptance: remaining defects are documented.
  7. Acceptance: defect severity is captured.
  8. Acceptance: demo impact is captured.

- **Dependencies:** TASK-8-01, TASK-7-06
- **Sprint Goal Contribution:** Confirms the deployed release candidate is ready for presentation.

#### TASK-8-03 — Validate AI Quality and Demo Data
- **Type:** Task
- **Priority:** High
- **Assigned To:** M2 — AI Engineer
- **Story Points:** 8
- **Task breakdown:**
  1. Validate demo AI outputs for skill profiling.
  2. Validate eligibility decisions.
  3. Validate matching outputs.
  4. Gold skill-gap guidance using trace evidence.
  5. Validate seeded GitHub/project data.
  6. Acceptance: confidence is present.
  7. Acceptance: justification is present.
  8. Acceptance: source attribution is present.
  9. Acceptance: AI-driven demo moments are covered.

- **Dependencies:** TASK-7-03
- **Sprint Goal Contribution:** Ensures the AI Trinity behaviors are reliable and explainable during the demo.

#### TASK-8-04 — Prepare Production Data and Admin Review Readiness
- **Type:** Task
- **Priority:** High
- **Assigned To:** M4 — Backend & Integration
- **Story Points:** 5
- **Task breakdown:**
  1. Prepare deployment-safe seed data.
  2. Verify admin/support readiness.
  3. Cover pending skills.
  4. Cover reports.
  5. Cover disputes.
  6. Cover fraud/misuse prevention actions.
  7. Acceptance: seeded scenarios support the final demo.
  8. Acceptance: required trust gates are not bypassed.

- **Dependencies:** TASK-6-06, TASK-8-03
- **Sprint Goal Contribution:** Makes the trust-and-safety workflows demonstrable in the deployed environment.

#### TASK-8-05 — Deploy MVP to AWS
- **Type:** Story
- **Priority:** High
- **Assigned To:** M5 — Backend & Integration
- **Story Points:** 8
- **Task breakdown:**
  1. Deploy the Share-k MVP to AWS with application services.
  2. Configure database connectivity.
  3. Configure environment settings.
  4. Execute CI/CD release workflow.
  5. Acceptance: deployed environment supports core MVP workflows.
  6. Acceptance: public demo path is usable.

- **Dependencies:** TASK-7-05, TASK-8-04
- **Sprint Goal Contribution:** Delivers the cloud-hosted MVP required for final presentation.

#### TASK-8-06 — Configure CloudWatch, Langfuse, and Release Monitoring
- **Type:** Task
- **Priority:** High
- **Assigned To:** M6 — DevOps & QA Automation
- **Story Points:** 5
- **Task breakdown:**
  1. Configure CloudWatch monitoring.
  2. Configure Langfuse observability support.
  3. Support AI traces.
  4. Acceptance: visibility into API health.
  5. Acceptance: runtime errors are visible.
  6. Acceptance: AI agent trace behavior during demo use.

- **Dependencies:** TASK-8-05, TASK-7-03, TASK-7-07
- **Sprint Goal Contribution:** Provides operational confidence for the deployed MVP and AI workflows.

#### TASK-8-07 — Production Smoke Test and Demo Readiness Sign-Off
- **Type:** Task
- **Priority:** High
- **Assigned To:** M6 — DevOps & QA Automation
- **Story Points:** 5
- **Task breakdown:**
  1. Run production smoke tests against the AWS deployment and verify CI/CD.
  2. Verify monitoring.
  3. Verify AI trace capture.
  4. Verify automated test evidence.
  5. Acceptance: final sign-off that core demo workflows are reachable.
  6. Acceptance: workflows are monitored.
  7. Acceptance: workflows are recoverable enough for demo.
  8. Acceptance: presentation readiness is confirmed.

- **Dependencies:** TASK-8-02, TASK-8-05, TASK-8-06
- **Sprint Goal Contribution:** Closes the backlog with release confidence and demo readiness.

---

## Appendix: Member Role Reference

| Member | Role | Sprint-by-sprint primary focus summary |
|---|---|---|
| M1 | M1 — UI/UX & Testing | S1: UX flows and design system baseline; S2: profile skill-status/admin/project publishing design plus tests; S3: skill profile/discovery design plus tests; S4: AI-gated application flow design plus E2E tests; S5: delivery/reputation/guidance design plus tests; S6: premium/matching design plus tests; S7: accessibility polish and E2E suite; S8: demo UX script and regression testing. |
| M2 | M2 — AI Engineer | S1: AI, RAG, and Pinecone contracts; S2: RAG indexing; S3: Skill Profiling Agent; S4: Skill Validation Agent; S5: Skill Gap Guidance Agent; S6: Contributor Matching Agent; S7: AI observability and quality tracing; S8: AI quality validation and demo data readiness. |
| M3 | M3 — Frontend & Integration | S1: Next.js app shell; S2: optional profile skill flow and project publishing UI; S3: skill profile, admin review, and discovery UI; S4: contribution request, task feed, and owner application review UI; S5: delivery review and reputation UI; S6: premium and matching UI; S7: integration support for polished flows; S8: support final UI fixes found during regression. |
| M4 | M4 — Backend & Integration | S1: database and auth foundations; S2: project metadata publication APIs; S3: skill profile persistence; S4: contribution request APIs; S5: delivery and review APIs; S6: subscription enforcement plus dispute/report APIs; S7: backend hardening; S8: production data and admin readiness. |
| M5 | M5 — Backend & Integration | S1: GitHub API ingestion service; S2: admin skill review backend; S3: discovery APIs; S4: AI-gated application orchestration; S5: reputation APIs; S6: premium benefit APIs; S7: GitHub Actions CI/CD; S8: AWS deployment. |
| M6 | M6 — DevOps & QA Automation | S1: Docker/local development baseline; S2: API contract checks; S3: available for automation support; S4: available for validation support; S5: available for test infrastructure support; S6: available for premium test automation support; S7: automated test infrastructure and Sentry monitoring; S8: CloudWatch, Langfuse, production smoke tests, and release sign-off. |
