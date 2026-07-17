# Sprint 2 — Onboarding, Admin Review, and Project Publishing

**Sprint Goal:** Complete user onboarding, pending AI skill review support, and owner project publication from GitHub metadata.
**Duration:** Week 2

---

## Feature 1: Contributor Onboarding Flow

### User Story 2.1 — View Onboarding Status as a Contributor

> **As a** contributor,
> **I want to** see clear onboarding status updates after connecting my GitHub account,
> **So that** I understand where I am in the activation process and what's happening behind the scenes.

**Acceptance Criteria:**

- After GitHub connection, the contributor sees a status screen with distinct states:
  - **Ingesting**: "Analyzing your GitHub activity…" with a spinner/progress indicator.
  - **Pending Review**: "Your skill profile has been generated and is awaiting admin review."
  - **Approved**: "Your profile is active! Start exploring projects."
  - **Rejected**: "Your skill profile could not be verified. Contact support."
- The status updates automatically or on page refresh.
- Error states (ingestion failure) show a retry option and a clear message.

**Priority:** High
**Related Tasks:** TASK-2-01, TASK-2-02
**PRD References:** FR-014, FR-030

### User Journey 2.1 — Contributor Onboarding Status

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Contributor logs in after email verification + GitHub connection         │
│    └─> Redirected to Onboarding Status screen                              │
│                                                                             │
│ 2. State: INGESTING                                                         │
│    └─> UI shows animated spinner with "Analyzing your GitHub activity…"    │
│    └─> GitHub repos, languages, commits are being fetched in the background│
│    └─> After ingestion completes → skill profile is generated (pending)    │
│                                                                             │
│ 3. State: PENDING REVIEW                                                    │
│    └─> UI shows: "Your skill profile is ready and awaiting admin review."  │
│    └─> A preview of generated skills is shown (read-only)                  │
│    └─> Skills shown with proficiency labels: Beginner/Intermediate/Advanced│
│    └─> Each skill shows the evidence source (e.g., "From repo: my-app")   │
│                                                                             │
│ 4. State: APPROVED                                                          │
│    └─> UI shows success: "Your profile is active!"                         │
│    └─> CTA: "Start exploring projects" → navigates to Discovery feed       │
│    └─> Account status changes to `active`                                  │
│                                                                             │
│ 5. State: REJECTED                                                          │
│    └─> UI shows: "Some of your skills could not be verified."              │
│    └─> Shows which skills were rejected and why (if admin left a note)     │
│    └─> Option to contact support or reconnect GitHub                       │
│                                                                             │
│ 6. State: ERROR                                                             │
│    └─> "We encountered an issue analyzing your GitHub data."               │
│    └─> "Retry" button to re-trigger ingestion                              │
│    └─> "Contact Support" link                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 2: Project Publishing from GitHub

### User Story 2.2 — Submit a GitHub Repository URL

> **As a** project owner,
> **I want to** submit a GitHub repository URL,
> **So that** Share-k can fetch the project's metadata automatically.

**Acceptance Criteria:**

- The owner can navigate to a "Publish Project" screen from their dashboard.
- A text input accepts a valid GitHub repository URL (e.g., `https://github.com/owner/repo`).
- On submission, the system validates the URL format.
- The system fetches: title, description, programming languages, tags/technologies, and repository statistics.
- A loading state is shown during the fetch: "Fetching project details…"
- If the repo is not found or inaccessible, an error message is shown.

**Priority:** High
**Related Tasks:** TASK-2-02, TASK-2-03
**PRD References:** FR-002, FR-034, FR-035

### User Story 2.3 — Review and Edit Fetched Project Metadata

> **As a** project owner,
> **I want to** review and edit the auto-fetched project metadata before publishing,
> **So that** I can ensure accuracy and add context that the auto-fetch may have missed.

**Acceptance Criteria:**

- After fetch completes, the owner sees a pre-filled form with:
  - Project title (editable)
  - Description (editable)
  - Programming languages (displayed as tags, editable)
  - Technologies/tags (editable)
  - Difficulty level (dropdown: Beginner, Intermediate, Advanced)
  - Category (dropdown: Web Development, Mobile Development, AI/ML, DevOps, Tools & Utilities)
  - Repository statistics (read-only: stars, forks, contributors count)
- Owner can save as "Draft" (unpublished) or click "Publish."
- Published projects become visible on the discovery feed.
- Draft projects are only visible to the owner.

**Priority:** High
**Related Tasks:** TASK-2-02, TASK-2-03
**PRD References:** FR-003, FR-036, FR-037

### User Story 2.4 — Publish a Project

> **As a** project owner,
> **I want to** confirm and publish my project,
> **So that** contributors can discover it and apply to contribution tasks.

**Acceptance Criteria:**

- The "Publish" action transitions the project from draft to published.
- Published projects appear in the contributor discovery feed.
- The project is associated with the owning user.
- Published project metadata is indexed for keyword filtering and semantic discovery.
- The owner can unpublish a project later if needed.

**Priority:** High
**Related Tasks:** TASK-2-03
**PRD References:** FR-037, FR-038, FR-039

### User Journey 2.2–2.4 — Project Publishing (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Owner Dashboard                                                          │
│    └─> Owner sees "My Projects" section (empty at first)                   │
│    └─> Clicks "+ Publish a Project"                                        │
│                                                                             │
│ 2. Repository URL Submission                                                │
│    └─> Text input: "Enter your GitHub repository URL"                      │
│    └─> Owner pastes: https://github.com/johndoe/awesome-api                │
│    └─> Clicks "Fetch Details"                                              │
│                                                                             │
│ 3. Loading State                                                            │
│    └─> "Fetching project details from GitHub…" with spinner                │
│    └─> System calls GitHub API: repo info, languages, README, stats        │
│                                                                             │
│ 4. Metadata Review Form (pre-filled)                                        │
│    ├─> Title: "Awesome API" ← editable                                     │
│    ├─> Description: "A RESTful API for…" ← editable                       │
│    ├─> Languages: [JavaScript, TypeScript] ← editable tag chips            │
│    ├─> Technologies: [Node.js, Express, PostgreSQL] ← editable            │
│    ├─> Difficulty: [Intermediate ▼] ← dropdown                            │
│    ├─> Category: [Web Development ▼] ← dropdown                           │
│    └─> Stats: ⭐ 45 stars · 🍴 12 forks · 👥 5 contributors (read-only)  │
│                                                                             │
│ 5. Save Options                                                             │
│    ├─> "Save as Draft" → project saved but NOT visible to contributors     │
│    └─> "Publish" → project becomes visible in discovery feed               │
│                                                                             │
│ 6. Post-Publish                                                             │
│    └─> Owner redirected to project detail page                             │
│    └─> Success toast: "Project published successfully!"                    │
│    └─> Project card now appears in "My Projects" list                      │
│    └─> CTA: "Create a Contribution Request" (for Sprint 4)                 │
│                                                                             │
│ 7. Error Handling                                                           │
│    ├─> Invalid URL format → "Please enter a valid GitHub repository URL."  │
│    ├─> Repo not found → "Repository not found. Check the URL and try."     │
│    ├─> Private repo → "This repository is private. Share-k requires…"     │
│    └─> Network error → "Unable to reach GitHub. Please try again later."   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 3: Admin Skill Profile Review

### User Story 2.5 — Review Pending AI-Generated Skill Profiles

> **As an** admin,
> **I want to** review AI-generated skill profiles for newly registered contributors,
> **So that** I can ensure only accurately assessed skills are used for task eligibility.

**Acceptance Criteria:**

- Admin dashboard has a "Pending Skill Reviews" section with a count badge.
- Each pending review shows: contributor name, generated skills with proficiency levels, confidence scores, and evidence sources.
- Admin can perform actions per skill:
  - **Approve** — skill is marked as approved and can be used for eligibility.
  - **Reject** — skill is rejected and excluded from eligibility.
  - **Adjust** — admin can change the proficiency level (e.g., Advanced → Intermediate) then approve.
- After all skills for a contributor are reviewed, the contributor's account can be activated.
- Pending or rejected skills are excluded from eligibility decisions.

**Priority:** High
**Related Tasks:** TASK-2-04
**PRD References:** FR-023, FR-024, FR-031, FR-032

### User Story 2.6 — Approve a Contributor's Skill Profile

> **As an** admin,
> **I want to** approve a contributor's skill profile (fully or partially),
> **So that** the contributor's account becomes active and they can apply to matching tasks.

**Acceptance Criteria:**

- Admin can approve individual skills or bulk-approve all skills for a contributor.
- Approved skills are immediately available for AI validation in task applications.
- If at least one skill is approved, the contributor's account status transitions to `active`.
- The admin review decision is stored with a timestamp and reviewer ID.
- The contributor is notified that their profile has been reviewed.

**Priority:** High
**Related Tasks:** TASK-2-04
**PRD References:** FR-023, FR-031, NFR-001

### User Journey 2.5–2.6 — Admin Skill Review

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Admin logs in                                                            │
│    └─> Dashboard shows: "Pending Skill Reviews: 5"                         │
│    └─> Clicks "Pending Skill Reviews"                                      │
│                                                                             │
│ 2. Pending Reviews List                                                     │
│    └─> List of contributors with pending profiles                          │
│    └─> Each card shows: Name, GitHub username, number of skills detected   │
│    └─> Admin clicks on "Ahmed Mohamed" to review                           │
│                                                                             │
│ 3. Skill Review Detail Screen                                               │
│    ├─> Contributor: Ahmed Mohamed (@ahmed-dev)                              │
│    ├─> Connected: 2 hours ago                                              │
│    ├─> Repositories analyzed: 12                                           │
│    │                                                                        │
│    ├─> Skill 1: Python — Advanced (Confidence: 92%)                        │
│    │   └─> Evidence: "Primary language in 8/12 repos, including            │
│    │       django-ecommerce (2.3k LOC) and ml-pipeline (1.8k LOC)"         │
│    │   └─> Actions: [✅ Approve] [❌ Reject] [✏️ Adjust]                  │
│    │                                                                        │
│    ├─> Skill 2: React — Intermediate (Confidence: 78%)                     │
│    │   └─> Evidence: "Used in 3 repos, component-based architecture in     │
│    │       portfolio-site and task-manager"                                 │
│    │   └─> Actions: [✅ Approve] [❌ Reject] [✏️ Adjust]                  │
│    │                                                                        │
│    ├─> Skill 3: Docker — Beginner (Confidence: 45%)                        │
│    │   └─> Evidence: "Dockerfile found in 1 repo, basic docker-compose"    │
│    │   └─> Actions: [✅ Approve] [❌ Reject] [✏️ Adjust]                  │
│    │                                                                        │
│    └─> Bulk action: [Approve All] [Reject All]                             │
│                                                                             │
│ 4. Admin Actions                                                            │
│    ├─> Approves Python (Advanced) ✅                                       │
│    ├─> Approves React (Intermediate) ✅                                    │
│    ├─> Adjusts Docker: Beginner → rejects (confidence too low) ❌          │
│    └─> Clicks "Submit Review"                                              │
│                                                                             │
│ 5. Post-Review                                                              │
│    └─> Admin decision is stored with timestamp + reviewer ID               │
│    └─> Contributor's account status → `active`                             │
│    └─> Contributor receives notification: "Your skill profile is approved!"│
│    └─> Ahmed can now log in and see the full contributor dashboard         │
│    └─> Approved skills (Python, React) are usable for task applications    │
│    └─> Rejected skills (Docker) are excluded from eligibility              │
│                                                                             │
│ 6. Admin Dashboard Updated                                                  │
│    └─> "Pending Skill Reviews: 4" (decreased by 1)                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 4: RAG Indexing for GitHub and Project Metadata

### User Story 2.7 — Index GitHub and Project Data for AI Retrieval

> **As the** system,
> **I want to** index GitHub data (README content, code evidence, commit messages, repo descriptions) and project metadata into Pinecone,
> **So that** AI agents can retrieve relevant evidence for skill profiling, matching, and discovery.

**Acceptance Criteria:**

- After GitHub ingestion, the system indexes:
  - README content (chunked appropriately for embedding)
  - Code evidence summaries (language usage, key frameworks detected)
  - Commit messages (where available and informative)
  - Repository descriptions
  - Contributor profile evidence
- After project publication, the system indexes published project metadata.
- Each indexed entry includes source attribution (repo name, file path, contributor ID).
- Indexed data is retrievable by the Skill Profiling Agent and Semantic Discovery.

**Priority:** High
**Related Tasks:** TASK-2-05
**PRD References:** FR-086, FR-087, FR-088

### User Journey 2.7 — RAG Indexing Pipeline (System-Level)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Trigger: GitHub Ingestion Complete                                       │
│    └─> For each repository in the contributor's account:                    │
│                                                                             │
│ 2. Document Chunking                                                        │
│    ├─> README.md → split into meaningful chunks (max ~500 tokens each)     │
│    ├─> Code evidence → summarize language usage, key frameworks, patterns  │
│    ├─> Commit messages → extract informative commits (filter out noise)    │
│    └─> Repo description → embed as single chunk                           │
│                                                                             │
│ 3. Embedding Generation                                                     │
│    └─> Each chunk is passed through the embedding model                    │
│    └─> Vectors are generated with metadata:                                │
│        { source_type: "readme", repo: "my-app", contributor_id: "xyz",    │
│          chunk_text: "...", file_path: "README.md" }                       │
│                                                                             │
│ 4. Pinecone Upsert                                                         │
│    └─> Vectors are upserted to the appropriate Pinecone namespace          │
│    └─> Contributor evidence → "contributor-profiles" namespace             │
│    └─> Project metadata → "project-metadata" namespace                     │
│                                                                             │
│ 5. Trigger: Project Published                                               │
│    └─> Project metadata (title, description, technologies, category,       │
│        difficulty) is embedded and indexed in "project-metadata" namespace  │
│                                                                             │
│ 6. Verification                                                             │
│    └─> Query test: retrieve evidence for a known skill                     │
│    └─> Confirm source attribution is preserved in results                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 5: API Contract Validation (CI/CD)

### User Story 2.8 — Validate API Contracts Between Frontend and Backend

> **As a** developer,
> **I want to** have automated contract checks for key API endpoints,
> **So that** response shape changes are caught early and don't break the frontend integration.

**Acceptance Criteria:**

- Schema validation checks are defined for:
  - Auth endpoints (register, login, session refresh)
  - GitHub metadata endpoints (connect, fetch repo data)
  - Project publication endpoints (create, publish, list)
  - Admin skill review endpoints (list pending, approve, reject, adjust)
- Checks are CI-runnable (can be triggered in GitHub Actions).
- If a response shape drifts from the contract, the check fails with a descriptive error.

**Priority:** Medium
**Related Tasks:** TASK-2-07
**PRD References:** —

---

## Sprint 2 Summary Table

| Story ID | User Story | Actor | Priority | Tasks |
|----------|-----------|-------|----------|-------|
| US-2.1 | View Onboarding Status | Contributor | High | TASK-2-01, TASK-2-02 |
| US-2.2 | Submit GitHub Repo URL | Project Owner | High | TASK-2-02, TASK-2-03 |
| US-2.3 | Review/Edit Project Metadata | Project Owner | High | TASK-2-02, TASK-2-03 |
| US-2.4 | Publish a Project | Project Owner | High | TASK-2-03 |
| US-2.5 | Review Pending Skill Profiles | Admin | High | TASK-2-04 |
| US-2.6 | Approve Contributor Skills | Admin | High | TASK-2-04 |
| US-2.7 | Index GitHub/Project Data for RAG | System | High | TASK-2-05 |
| US-2.8 | Validate API Contracts | Dev Team | Medium | TASK-2-07 |
