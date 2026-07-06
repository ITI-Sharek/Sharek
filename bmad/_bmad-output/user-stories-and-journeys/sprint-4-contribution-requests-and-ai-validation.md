# Sprint 4 — Contribution Requests and AI Validation Gate

**Sprint Goal:** Enable owners to publish contribution requests and gate contributor applications through AI validation before owner review.
**Duration:** Week 4

---

## Feature 1: Contribution Request Management (Owner)

### User Story 4.1 — Create a Contribution Request

> **As a** project owner,
> **I want to** create a contribution request (task) linked to one of my published projects,
> **So that** I can describe specific work I need from contributors.

**Acceptance Criteria:**

- Owner can create a contribution request from a published project's detail page.
- The creation form includes:
  - **Title** (required) — e.g., "Add JWT Authentication"
  - **Description** (required) — detailed explanation of the work
  - **Required technologies** (multi-select tags) — e.g., Node.js, JWT, Express
  - **Difficulty level** (dropdown) — Beginner, Intermediate, Advanced
  - **Deadline** (date picker) — when the work must be completed
  - **Reward** (optional) — monetary amount for completing the task
- The request is linked to the parent project.
- The request can be saved as a draft or published immediately.
- Owner's monthly order limit is checked before creation (based on subscription plan).
- If the monthly limit is reached, the owner sees: "You've reached your monthly order limit. Upgrade your plan to create more."

**Priority:** High
**Related Tasks:** TASK-4-02, TASK-4-03
**PRD References:** FR-004, FR-046, FR-047, FR-050

### User Story 4.2 — Publish and Manage Contribution Requests

> **As a** project owner,
> **I want to** publish, edit, and manage my contribution requests,
> **So that** contributors can discover them and I can keep task details up to date.

**Acceptance Criteria:**

- Published contribution requests appear in the contributor task feed.
- Owner can view a list of all their contribution requests (draft + published).
- Owner can edit an existing request (title, description, technologies, deadline, etc.).
- Owner can unpublish or close a request when it's no longer needed.
- Each request shows its current status: Draft, Published, In Progress, Completed.

**Priority:** High
**Related Tasks:** TASK-4-02, TASK-4-03
**PRD References:** FR-004, FR-048

### User Journey 4.1–4.2 — Creating and Publishing a Contribution Request

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Owner navigates to "My Projects" → clicks on "Awesome API"             │
│    └─> Project detail page opens                                           │
│    └─> Clicks "+ Create Contribution Request"                              │
│                                                                             │
│ 2. Contribution Request Form                                                │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ Project: Awesome API (linked automatically)                          │ │
│    │                                                                      │ │
│    │ Title: [Add JWT Authentication_____________________]                  │ │
│    │                                                                      │ │
│    │ Description:                                                         │ │
│    │ [Implement JWT-based authentication for the API. This includes       │ │
│    │  user registration, login, token generation, refresh tokens,         │ │
│    │  and middleware for protected routes. Follow the existing            │ │
│    │  Express patterns in the codebase.________________________]          │ │
│    │                                                                      │ │
│    │ Required Technologies: [Node.js] [JWT] [Express] [+ Add]            │ │
│    │                                                                      │ │
│    │ Difficulty: [Intermediate ▼]                                         │ │
│    │                                                                      │ │
│    │ Deadline: [2026-08-15 📅]                                            │ │
│    │                                                                      │ │
│    │ Reward (optional): [$ 50___]                                         │ │
│    │                                                                      │ │
│    │ [Save as Draft]  [Publish]                                           │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 3. Monthly Limit Check                                                      │
│    ├─> System checks: Owner is Bronze plan → limit: 10 orders/month       │
│    ├─> Current month: 7 orders created → under limit ✅                    │
│    └─> If at limit → "You've reached your monthly limit (10/10).          │
│        Upgrade to Silver or Gold for more."                                │
│                                                                             │
│ 4. Publish Action                                                           │
│    └─> Owner clicks "Publish"                                              │
│    └─> System indexes the request requirements for AI validation           │
│    └─> Request appears in the contributor task feed                        │
│    └─> Success toast: "Contribution request published!"                    │
│                                                                             │
│ 5. Owner Management View                                                    │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ MY CONTRIBUTION REQUESTS                                             │ │
│    │                                                                      │ │
│    │ 📋 Add JWT Authentication — Published — 0 applications               │ │
│    │ 📋 Fix Pagination Bug — Draft — not visible to contributors          │ │
│    │ 📋 Add Docker Setup — Published — 3 applications                     │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 6. Edit / Unpublish                                                         │
│    └─> Owner clicks edit icon → form reopens with pre-filled data         │
│    └─> Owner clicks "Unpublish" → request hidden from task feed           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 2: Contributor Task Feed and Application

### User Story 4.3 — Browse Contribution Requests (Task Feed)

> **As a** contributor,
> **I want to** browse published contribution requests in a task feed,
> **So that** I can find tasks that match my skills and interests.

**Acceptance Criteria:**

- Contributors see a "Task Feed" or "Contribution Opportunities" page.
- Each task card shows: title, project name, required technologies, difficulty, deadline, reward (if any).
- Tasks are filterable by technology, difficulty, and project category.
- Only published requests are visible.
- Clicking a task opens its detail page with full description and requirements.

**Priority:** High
**Related Tasks:** TASK-4-03
**PRD References:** FR-016, FR-048

### User Story 4.4 — Apply to a Contribution Request

> **As a** contributor,
> **I want to** apply to a contribution request that matches my skills,
> **So that** I can work on real open-source tasks and build my reputation.

**Acceptance Criteria:**

- On the task detail page, an "Apply" button is visible.
- Before applying, the contributor can optionally add a cover note explaining why they're a good fit.
- On submission, the system checks the contributor's daily application limit (based on subscription plan).
- If the daily limit is reached, the contributor sees: "You've reached your daily application limit. Try again tomorrow or upgrade your plan."
- After application submission, the AI validation gate is triggered automatically.
- The contributor sees: "Application submitted! AI is validating your eligibility…"

**Priority:** High
**Related Tasks:** TASK-4-03, TASK-4-05
**PRD References:** FR-017, FR-051

### User Journey 4.3–4.4 — Browsing and Applying to Tasks

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Contributor "Sara" navigates to "Task Feed"                             │
│                                                                             │
│ 2. Task Feed View                                                           │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ CONTRIBUTION OPPORTUNITIES                                           │ │
│    │                                                                      │ │
│    │ Filters: Technology [All ▼] Difficulty [All ▼] Category [All ▼]     │ │
│    │                                                                      │ │
│    │ ┌────────────────────────────────────────────────────────────────┐   │ │
│    │ │ 🎯 Add JWT Authentication                                     │   │ │
│    │ │ 📦 Project: Awesome API                                       │   │ │
│    │ │ 🏷️ Node.js · JWT · Express                                   │   │ │
│    │ │ ⚡ Intermediate · 📅 Due: Aug 15 · 💰 $50                    │   │ │
│    │ └────────────────────────────────────────────────────────────────┘   │ │
│    │                                                                      │ │
│    │ ┌────────────────────────────────────────────────────────────────┐   │ │
│    │ │ 🎯 Build Mobile-Responsive Dashboard                          │   │ │
│    │ │ 📦 Project: Analytics Platform                                │   │ │
│    │ │ 🏷️ React · TypeScript · CSS                                  │   │ │
│    │ │ ⚡ Beginner · 📅 Due: Aug 20                                  │   │ │
│    │ └────────────────────────────────────────────────────────────────┘   │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 3. Sara clicks "Add JWT Authentication" → Task Detail Page                 │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ ADD JWT AUTHENTICATION                                               │ │
│    │ Project: Awesome API by @johndoe                                     │ │
│    │                                                                      │ │
│    │ Description:                                                         │ │
│    │ Implement JWT-based authentication for the API. This includes        │ │
│    │ user registration, login, token generation, refresh tokens,          │ │
│    │ and middleware for protected routes...                                │ │
│    │                                                                      │ │
│    │ Required: Node.js · JWT · Express                                    │ │
│    │ Difficulty: Intermediate                                             │ │
│    │ Deadline: August 15, 2026                                            │ │
│    │ Reward: $50                                                          │ │
│    │                                                                      │ │
│    │ Cover Note (optional):                                               │ │
│    │ [I have experience building JWT auth in my personal projects.        │ │
│    │  I implemented a similar system in my ecommerce-api repo.__]         │ │
│    │                                                                      │ │
│    │ [Apply Now]                                                          │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 4. Daily Limit Check                                                        │
│    ├─> Sara is Bronze plan → limit: 2 applications/day                    │
│    ├─> Today: 1 application submitted → under limit ✅                    │
│    └─> If at limit → "You've reached your daily limit. Try tomorrow       │
│        or upgrade your plan."                                              │
│                                                                             │
│ 5. Application Submitted                                                    │
│    └─> Sara clicks "Apply Now"                                             │
│    └─> UI shows: "Application submitted! AI is validating your            │
│        eligibility…" with a loading spinner                                │
│    └─> AI Validation Agent is triggered (see Feature 3 below)              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 3: AI Validation Gate

### User Story 4.5 — AI Validates Contributor Eligibility on Application

> **As the** system,
> **I want to** automatically validate a contributor's skills against the task's requirements when they apply,
> **So that** only eligible contributors' applications reach the project owner.

**Acceptance Criteria:**

- When a contributor submits an application, the Skill Validation Agent is invoked.
- The agent compares the contribution request's required technologies and difficulty against the contributor's **approved** skills only.
- Pending, rejected, or low-confidence skills are excluded from the comparison.
- The validation result includes:
  - **Eligibility decision**: eligible or ineligible
  - **Confidence score** (0–100%)
  - **Justification**: explanation of why the contributor is/isn't eligible
  - **Source attribution**: which skills and evidence were considered
- If **eligible**: application is forwarded to the project owner's review queue.
- If **ineligible**: application is blocked and the contributor is notified.
- Low-confidence validation results are flagged for manual review.

**Priority:** High
**Related Tasks:** TASK-4-04, TASK-4-05
**PRD References:** FR-051, FR-052, FR-053, FR-054, FR-055, FR-058, FR-091

### User Story 4.6 — Receive Ineligibility Notification

> **As a** contributor who has been found ineligible for a task,
> **I want to** receive a clear explanation of why I don't meet the requirements,
> **So that** I understand the gap and can work to improve.

**Acceptance Criteria:**

- Ineligible contributors receive an in-app notification.
- The notification includes: task title, a brief reason (e.g., "Missing required skill: JWT"), and the confidence level of the decision.
- The contributor's application history shows the application with "Ineligible" status.
- The application never reaches the project owner.
- If the contributor is Gold-tier, a link to skill-gap guidance is shown (Sprint 5).

**Priority:** High
**Related Tasks:** TASK-4-05
**PRD References:** FR-018, FR-019, FR-056

### User Journey 4.5–4.6 — AI Validation Gate (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO A: CONTRIBUTOR IS ELIGIBLE                                         │
│                                                                             │
│ 1. Sara applies to "Add JWT Authentication"                                │
│    └─> Required skills: Node.js, JWT, Express (Intermediate)               │
│    └─> Sara's approved skills: TypeScript (Advanced), React (Advanced),    │
│        Node.js (Intermediate) ← approved by admin                          │
│                                                                             │
│ 2. AI Validation Agent Runs                                                 │
│    └─> Input: task requirements + Sara's approved skill profile            │
│    └─> Agent queries: Does Sara have Node.js? → Yes (Intermediate) ✅     │
│    └─> Agent queries: Does Sara have Express-related experience? →         │
│        Yes, Node.js repos include Express usage (from evidence) ✅         │
│    └─> Agent queries: JWT experience? → Found JWT usage in 2 repos ✅     │
│    └─> Agent queries: Difficulty match? → Intermediate ≤ her level ✅     │
│                                                                             │
│ 3. Validation Result                                                        │
│    └─> Decision: ELIGIBLE                                                  │
│    └─> Confidence: 87%                                                     │
│    └─> Justification: "Sara has approved Intermediate-level Node.js        │
│        skills with Express and JWT experience evidenced in 2 repos."       │
│                                                                             │
│ 4. Application Forwarded                                                    │
│    └─> Application appears in owner @johndoe's review queue                │
│    └─> Sara sees: "✅ Your application is eligible and forwarded to        │
│        the project owner for review."                                      │
│    └─> Application status: "Pending Owner Review"                          │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO B: CONTRIBUTOR IS INELIGIBLE                                       │
│                                                                             │
│ 1. Contributor "Omar" applies to "Add JWT Authentication"                  │
│    └─> Required: Node.js, JWT, Express (Intermediate)                      │
│    └─> Omar's approved skills: Python (Advanced), Django (Intermediate)    │
│        → No Node.js, no JWT, no Express                                    │
│                                                                             │
│ 2. AI Validation Agent Runs                                                 │
│    └─> Agent queries: Does Omar have Node.js? → No ❌                     │
│    └─> Agent queries: Express? → No ❌                                    │
│    └─> Agent queries: JWT? → No ❌                                        │
│    └─> Agent queries: Any transferable skills? → Django is server-side     │
│        but not a match for this specific stack.                             │
│                                                                             │
│ 3. Validation Result                                                        │
│    └─> Decision: INELIGIBLE                                                │
│    └─> Confidence: 94%                                                     │
│    └─> Justification: "Omar lacks the required Node.js, Express, and      │
│        JWT skills. His Python/Django experience is not transferable         │
│        for this specific task."                                            │
│                                                                             │
│ 4. Application Blocked                                                      │
│    └─> Application does NOT reach the project owner                        │
│    └─> Omar receives notification:                                         │
│        "❌ Your application for 'Add JWT Authentication' was not eligible. │
│         Reason: Missing required skills — Node.js, JWT, Express.           │
│         Confidence: 94%"                                                   │
│    └─> If Omar is Gold-tier → additional link: "View Skill Gap Guidance"   │
│    └─> Application status: "Ineligible"                                    │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO C: LOW-CONFIDENCE VALIDATION                                       │
│                                                                             │
│ 1. Contributor "Noor" applies — has some matching skills but evidence      │
│    is thin and confidence is 52%                                            │
│                                                                             │
│ 2. Validation Result                                                        │
│    └─> Decision: REVIEW_NEEDED                                             │
│    └─> Confidence: 52% ⚠️                                                 │
│    └─> Justification: "Noor has some Express experience but limited JWT    │
│        evidence. Confidence is below threshold."                           │
│                                                                             │
│ 3. Handling                                                                 │
│    └─> Application is flagged for admin/manual review                      │
│    └─> Noor sees: "⏳ Your application is being reviewed. Low-confidence   │
│        results require additional verification."                           │
│    └─> Admin can manually approve or reject the application                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 4: Owner Application Review

### User Story 4.7 — Review AI-Prevalidated Applications

> **As a** project owner,
> **I want to** review applications that have passed AI validation,
> **So that** I can choose the best contributor for my task from a pre-qualified shortlist.

**Acceptance Criteria:**

- Owner sees only eligible applications in their review queue (ineligible ones are filtered out).
- Each application card shows:
  - Contributor name and GitHub profile link
  - Contributor's reputation score (if available)
  - AI eligibility justification and confidence
  - Cover note (if submitted)
  - Relevant approved skills that matched the task
- Owner can **Accept** or **Reject** each application.
- Accepting an application assigns the task to that contributor and updates the status.
- Rejecting an application notifies the contributor: "The project owner has decided to proceed with another contributor."
- If an admin override or review flow permits, some flagged applications may appear with warnings.

**Priority:** High
**Related Tasks:** TASK-4-06
**PRD References:** FR-005, FR-006

### User Journey 4.7 — Owner Reviews Applications

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Owner @johndoe logs in → Dashboard shows notification:                  │
│    "You have 2 new applications for 'Add JWT Authentication'"              │
│                                                                             │
│ 2. Application Review Queue                                                 │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ APPLICATIONS FOR: Add JWT Authentication                             │ │
│    │                                                                      │ │
│    │ ┌────────────────────────────────────────────────────────────────┐   │ │
│    │ │ 👤 Sara Ahmed (@sara-dev)                                     │   │ │
│    │ │ ⭐ Reputation: 4.7 · 12 completed tasks · 95% success rate    │   │ │
│    │ │ 🤖 AI Eligibility: ELIGIBLE (87% confidence)                  │   │ │
│    │ │ "Sara has approved Intermediate-level Node.js skills with     │   │ │
│    │ │  Express and JWT experience evidenced in 2 repos."            │   │ │
│    │ │ 💬 Cover note: "I implemented a similar system in my          │   │ │
│    │ │  ecommerce-api repo."                                         │   │ │
│    │ │ ✅ Matched Skills: Node.js, Express (from evidence)           │   │ │
│    │ │                                                                │   │ │
│    │ │ [Accept ✅]  [Reject ❌]                                      │   │ │
│    │ └────────────────────────────────────────────────────────────────┘   │ │
│    │                                                                      │ │
│    │ ┌────────────────────────────────────────────────────────────────┐   │ │
│    │ │ 👤 Youssef Ali (@youssef-code)                                │   │ │
│    │ │ ⭐ Reputation: 3.9 · 5 completed tasks · 80% success rate     │   │ │
│    │ │ 🤖 AI Eligibility: ELIGIBLE (72% confidence)                  │   │ │
│    │ │ "Youssef has Node.js and Express skills. Limited JWT-specific │   │ │
│    │ │  experience but transferable authentication background."       │   │ │
│    │ │ ✅ Matched Skills: Node.js, Express                           │   │ │
│    │ │                                                                │   │ │
│    │ │ [Accept ✅]  [Reject ❌]                                      │   │ │
│    │ └────────────────────────────────────────────────────────────────┘   │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 3. Owner's Decision                                                         │
│    └─> Owner accepts Sara's application → Sara is assigned the task        │
│    └─> Sara receives notification: "🎉 You've been accepted for           │
│        'Add JWT Authentication'! You can start working."                   │
│    └─> Owner rejects Youssef → Youssef receives notification:             │
│        "The project owner has decided to proceed with another contributor."│
│                                                                             │
│ 4. Task Status Update                                                       │
│    └─> Contribution request status → "In Progress"                        │
│    └─> Sara's application status → "Accepted"                             │
│    └─> Youssef's application status → "Owner Rejected"                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Sprint 4 Summary Table

| Story ID | User Story | Actor | Priority | Tasks |
|----------|-----------|-------|----------|-------|
| US-4.1 | Create Contribution Request | Project Owner | High | TASK-4-02, TASK-4-03 |
| US-4.2 | Publish/Manage Requests | Project Owner | High | TASK-4-02, TASK-4-03 |
| US-4.3 | Browse Task Feed | Contributor | High | TASK-4-03 |
| US-4.4 | Apply to a Task | Contributor | High | TASK-4-03, TASK-4-05 |
| US-4.5 | AI Validates Eligibility | System | High | TASK-4-04, TASK-4-05 |
| US-4.6 | Ineligibility Notification | Contributor | High | TASK-4-05 |
| US-4.7 | Review Prevalidated Applications | Project Owner | High | TASK-4-06 |
