# Sprint 3 — Skill Profiling Agent and Discovery Foundation

**Sprint Goal:** Generate reviewable AI skill profiles from GitHub evidence and expose published projects through structured and semantic discovery.
**Duration:** Week 3

---

## Feature 1: AI Skill Profiling Agent

### User Story 3.1 — Generate AI Skill Profile from GitHub Data

> **As a** contributor,
> **I want** the system to automatically analyze my GitHub repositories and generate a structured skill profile,
> **So that** my technical abilities are objectively assessed based on real evidence rather than self-declaration.

**Acceptance Criteria:**

- After GitHub data ingestion completes, the Skill Profiling Agent runs automatically.
- The agent analyzes: repositories, README content, programming languages, contribution activity, commit signals, and project technologies.
- Output for each detected skill includes:
  - **Skill name** (e.g., "Python," "React," "Docker")
  - **Proficiency level**: Beginner, Intermediate, or Advanced
  - **Confidence score** (0–100%)
  - **Evidence source** (which repos/files support this assessment)
- Low-confidence skills (below threshold) are flagged for extra admin scrutiny.
- Generated skills are persisted in `pending` state — they cannot be used for task eligibility until admin approval.

**Priority:** High
**Related Tasks:** TASK-3-02, TASK-3-03
**PRD References:** FR-012, FR-013, FR-029, FR-030, FR-090

### User Journey 3.1 — AI Skill Profile Generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Trigger                                                                  │
│    └─> GitHub ingestion job completes for contributor "Sara"                │
│    └─> System dispatches: GenerateSkillProfile event                       │
│                                                                             │
│ 2. AI Agent Execution                                                       │
│    └─> Skill Profiling Agent receives:                                     │
│        - 15 repositories with metadata                                     │
│        - README content from each repo                                     │
│        - Language breakdown per repo                                       │
│        - Commit history highlights                                         │
│        - Contributor stats (additions, deletions, frequency)               │
│                                                                             │
│ 3. RAG Retrieval                                                            │
│    └─> Agent queries Pinecone for relevant indexed evidence                │
│    └─> Retrieves: code summaries, README snippets, tech patterns           │
│    └─> Uses retrieved evidence to enrich analysis                          │
│                                                                             │
│ 4. Skill Analysis & Structuring                                             │
│    └─> Agent identifies skills from evidence:                              │
│        ┌──────────────────────────────────────────────────────────┐         │
│        │ Skill      │ Level        │ Confidence │ Evidence        │         │
│        │────────────│──────────────│────────────│─────────────────│         │
│        │ TypeScript │ Advanced     │ 95%        │ 10/15 repos     │         │
│        │ React      │ Advanced     │ 91%        │ 6 repos, 3 with │         │
│        │            │              │            │ complex state   │         │
│        │ Node.js    │ Intermediate │ 82%        │ 4 repos, Express│         │
│        │ Docker     │ Beginner     │ 55%        │ 2 repos, basic  │         │
│        │            │              │            │ Dockerfiles     │         │
│        │ GraphQL    │ Beginner     │ 38%        │ 1 repo, minimal │         │
│        └──────────────────────────────────────────────────────────┘         │
│                                                                             │
│ 5. Low-Confidence Handling                                                  │
│    └─> GraphQL (38%) is flagged as low-confidence                          │
│    └─> Admin will see a ⚠️ warning next to it during review                │
│                                                                             │
│ 6. Persistence                                                              │
│    └─> All skills saved to skill_profiles table with status = `pending`    │
│    └─> Each record includes: user_id, skill_name, proficiency_level,       │
│        confidence_score, evidence_sources (JSON), status                    │
│                                                                             │
│ 7. Notification                                                             │
│    └─> Contributor's onboarding status updates to "Pending Admin Review"   │
│    └─> Admin receives notification: "New skill profile to review"          │
│                                                                             │
│ 8. Failure Handling                                                         │
│    └─> Agent timeout → retry up to 3 times with backoff                    │
│    └─> All retries fail → mark profile as "generation_failed"              │
│    └─> Contributor sees: "Skill generation encountered an issue. Retrying."│
│    └─> Admin sees failed profiles in a separate queue                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### User Story 3.2 — View My Generated Skill Profile

> **As a** contributor,
> **I want to** see my AI-generated skill profile with evidence sources,
> **So that** I can understand how the system assessed my abilities and prepare for admin review.

**Acceptance Criteria:**

- The contributor can view their skill profile from their dashboard.
- Each skill shows: skill name, proficiency level, confidence, and evidence sources.
- Pending skills are clearly labeled as "Awaiting Admin Review."
- Approved skills are shown with a green checkmark.
- Rejected skills are shown with a red indicator and reason (if provided by admin).
- The profile updates in real-time or on refresh as admin reviews come in.

**Priority:** High
**Related Tasks:** TASK-3-04
**PRD References:** FR-013, FR-033

### User Journey 3.2 — Contributor Skill Profile View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Contributor "Sara" logs in → navigates to "My Skills" section           │
│                                                                             │
│ 2. Skill Profile Display                                                    │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ MY SKILL PROFILE                                                     │ │
│    │                                                                      │ │
│    │ ✅ TypeScript — Advanced (Confidence: 95%)                           │ │
│    │    Evidence: Primary language in 10/15 repos including               │ │
│    │    e-commerce-app (4.2k LOC), dashboard-ui (3.1k LOC)               │ │
│    │    Status: APPROVED                                                  │ │
│    │                                                                      │ │
│    │ ✅ React — Advanced (Confidence: 91%)                                │ │
│    │    Evidence: Used in 6 repos with complex state management,          │ │
│    │    custom hooks, and component-based architecture                    │ │
│    │    Status: APPROVED                                                  │ │
│    │                                                                      │ │
│    │ ⏳ Node.js — Intermediate (Confidence: 82%)                          │ │
│    │    Evidence: Backend logic in 4 repos using Express                  │ │
│    │    Status: AWAITING REVIEW                                           │ │
│    │                                                                      │ │
│    │ ❌ Docker — Beginner (Confidence: 55%)                               │ │
│    │    Evidence: Dockerfile in 2 repos, basic docker-compose             │ │
│    │    Status: REJECTED — "Insufficient evidence for this skill"         │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 3. Actions Available                                                        │
│    └─> Contributor can view evidence details (expandable sections)         │
│    └─> If skills are disputed → link to dispute flow (Sprint 6)           │
│    └─> If account is still pending → "Your profile is being reviewed…"    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 2: Admin Skill Review Enhancements

### User Story 3.3 — Review Skill Profiles with Evidence Attribution

> **As an** admin,
> **I want to** see the full evidence backing each AI-generated skill,
> **So that** I can make informed decisions when approving, rejecting, or adjusting skills.

**Acceptance Criteria:**

- Admin review screen shows evidence sources per skill, including:
  - Repository names and links
  - Relevant code snippets or README excerpts
  - Language usage percentages
  - Commit activity metrics
- Evidence is clickable and links to the original GitHub source when possible.
- Low-confidence skills (< 50%) are highlighted with a warning icon.
- Admin can add a review note when adjusting or rejecting a skill.

**Priority:** High
**Related Tasks:** TASK-3-04, TASK-2-04
**PRD References:** FR-024, FR-033, NFR-001, NFR-003

### User Journey 3.3 — Enhanced Admin Review with Evidence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Admin navigates to "Pending Reviews" → selects contributor "Khaled"     │
│                                                                             │
│ 2. Detailed Evidence View                                                   │
│    ├─> Skill: JavaScript — Advanced (Confidence: 93%)                      │
│    │   ├─> 📁 Repos: ecommerce-api, blog-platform, quiz-app (7 total)     │
│    │   ├─> 📊 Language: JavaScript is 65% of total code                    │
│    │   ├─> 📝 README excerpts: "Built with vanilla JS and Node.js…"       │
│    │   ├─> 🔗 Evidence link: github.com/khaled/ecommerce-api              │
│    │   ├─> 📈 Commits: 340 JS-related commits across repos                │
│    │   └─> Admin sees: "High confidence, evidence is strong"               │
│    │                                                                        │
│    ├─> Skill: AWS — Beginner (Confidence: 32%) ⚠️ LOW CONFIDENCE          │
│    │   ├─> 📁 Repos: 1 repo with basic Lambda function                    │
│    │   ├─> 📊 Evidence: Only a small serverless.yml file found            │
│    │   ├─> 📈 Commits: 5 AWS-related commits                              │
│    │   └─> Admin thinks: "Not enough evidence, reject this one"            │
│    │                                                                        │
│    └─> Admin actions per skill:                                             │
│        ├─> JavaScript: [✅ Approve] → approved as Advanced                 │
│        └─> AWS: [❌ Reject] → adds note: "Minimal evidence, one small     │
│            Lambda. Suggest building more AWS projects."                     │
│                                                                             │
│ 3. Submit Review → decisions saved with reviewer ID and timestamp          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 3: Project Discovery Feed

### User Story 3.4 — Browse Published Projects

> **As a** contributor,
> **I want to** browse a feed of published projects,
> **So that** I can find open-source projects that interest me.

**Acceptance Criteria:**

- The discovery feed shows project cards with: title, description snippet, languages, technologies, difficulty level, category, and star count.
- Projects are sorted by relevance or recency by default.
- Only published projects are shown (drafts and unpublished are excluded).
- Each card is clickable to view the full project detail page.
- Pagination or infinite scroll is supported for large project lists.

**Priority:** High
**Related Tasks:** TASK-3-05, TASK-3-06
**PRD References:** FR-015, FR-040

### User Story 3.5 — Filter Projects by Technology, Category, and Difficulty

> **As a** contributor,
> **I want to** filter the project discovery feed by technology stack, category, and difficulty level,
> **So that** I can narrow down projects that match my skills and interests.

**Acceptance Criteria:**

- Filter panel includes:
  - **Technology stack**: multi-select (e.g., JavaScript, Python, React, Node.js, etc.)
  - **Category**: single-select dropdown with options:
    - Web Development, Mobile Development, AI / Machine Learning, DevOps, Tools & Utilities
  - **Difficulty level**: single-select (Beginner, Intermediate, Advanced)
- Filters can be combined (AND logic).
- Results update dynamically as filters are applied.
- A "Clear Filters" button resets all filters.
- If no projects match the filters, a friendly empty state is shown: "No projects match your filters. Try adjusting your criteria."

**Priority:** High
**Related Tasks:** TASK-3-05, TASK-3-06
**PRD References:** FR-041, FR-042, FR-043, FR-044

### User Story 3.6 — Discover Projects via Semantic Search

> **As a** contributor,
> **I want to** discover projects using natural-language search that goes beyond exact keyword matches,
> **So that** I can find relevant projects even when my search terms don't exactly match the project's tags.

**Acceptance Criteria:**

- A search bar at the top of the discovery feed accepts free-text queries.
- The system uses indexed project metadata (from RAG/Pinecone) to surface semantically relevant results.
- Example: searching "machine learning API" surfaces projects tagged with "Python," "TensorFlow," or "FastAPI" even if they don't contain the exact phrase.
- Semantic results are blended with structured filter results when both are active.

**Priority:** High
**Related Tasks:** TASK-3-05, TASK-2-05
**PRD References:** FR-045, FR-087

### User Journey 3.4–3.6 — Project Discovery (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Contributor "Sara" logs in → clicks "Discover Projects" in navbar       │
│                                                                             │
│ 2. Discovery Feed (Initial View)                                            │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ 🔍 Search projects... [_________________________________] [Search]   │ │
│    │                                                                      │ │
│    │ Filters:                                                             │ │
│    │ Technology: [All ▼]  Category: [All ▼]  Difficulty: [All ▼]         │ │
│    │ [Clear Filters]                                                      │ │
│    │                                                                      │ │
│    │ ┌────────────────────────────────────────────────────────────────┐   │ │
│    │ │ 📦 Awesome API                                                │   │ │
│    │ │ A RESTful API built with Node.js and Express for managing…    │   │ │
│    │ │ 🏷️ JavaScript · Node.js · Express · PostgreSQL               │   │ │
│    │ │ 📂 Web Development · ⚡ Intermediate · ⭐ 45                  │   │ │
│    │ └────────────────────────────────────────────────────────────────┘   │ │
│    │                                                                      │ │
│    │ ┌────────────────────────────────────────────────────────────────┐   │ │
│    │ │ 📦 ML Image Classifier                                        │   │ │
│    │ │ A deep learning image classifier using TensorFlow and…        │   │ │
│    │ │ 🏷️ Python · TensorFlow · Docker                              │   │ │
│    │ │ 📂 AI / Machine Learning · ⚡ Advanced · ⭐ 120               │   │ │
│    │ └────────────────────────────────────────────────────────────────┘   │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 3. Applying Filters                                                         │
│    └─> Sara selects: Technology = "React", Difficulty = "Intermediate"     │
│    └─> Feed updates to show only matching projects                         │
│    └─> 3 projects match → displayed with updated count                     │
│                                                                             │
│ 4. Semantic Search                                                          │
│    └─> Sara types: "real-time chat application"                            │
│    └─> System queries Pinecone for semantically similar project metadata   │
│    └─> Results include a project about "WebSocket messaging platform"      │
│        even though it doesn't contain "chat" in its tags                   │
│                                                                             │
│ 5. Project Detail                                                           │
│    └─> Sara clicks on "Awesome API" card                                   │
│    └─> Full project page shows:                                            │
│        - Full description                                                  │
│        - All technologies and requirements                                 │
│        - GitHub link (to the original repo)                                │
│        - Repository stats (stars, forks, contributors)                     │
│        - Contribution requests (tasks) — available from Sprint 4           │
│                                                                             │
│ 6. Empty State                                                              │
│    └─> If no projects match → "No projects match your filters.            │
│        Try adjusting your criteria or browse all projects."                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Sprint 3 Summary Table

| Story ID | User Story | Actor | Priority | Tasks |
|----------|-----------|-------|----------|-------|
| US-3.1 | Generate AI Skill Profile | System / Contributor | High | TASK-3-02, TASK-3-03 |
| US-3.2 | View Generated Skill Profile | Contributor | High | TASK-3-04 |
| US-3.3 | Review Skills with Evidence | Admin | High | TASK-3-04, TASK-2-04 |
| US-3.4 | Browse Published Projects | Contributor | High | TASK-3-05, TASK-3-06 |
| US-3.5 | Filter Projects | Contributor | High | TASK-3-05, TASK-3-06 |
| US-3.6 | Semantic Project Search | Contributor | High | TASK-3-05, TASK-2-05 |
