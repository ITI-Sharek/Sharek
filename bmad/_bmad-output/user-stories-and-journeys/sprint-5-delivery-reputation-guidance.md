# Sprint 5 — Delivery Review, Reputation, and Skill Gap Guidance

**Sprint Goal:** Complete contribution delivery review, reputation updates, and Gold-tier skill-gap guidance for rejected contributors.
**Duration:** Week 5

---

## Feature 1: Contribution Delivery

### User Story 5.1 — Submit a Pull Request as Delivery Evidence

> **As a** contributor who has been accepted for a task,
> **I want to** submit a GitHub pull request link as proof of my completed work,
> **So that** the project owner can review my contribution and approve it.

**Acceptance Criteria:**

- After being accepted, the contributor sees a "Submit Delivery" section on their task page.
- The form accepts a valid GitHub pull request URL.
- URL is validated to ensure it's a valid GitHub PR format (e.g., `https://github.com/owner/repo/pull/123`).
- After submission, the task status updates to "Delivery Submitted."
- The project owner is notified: "A contributor has submitted delivery for your task."
- The contributor can update the PR link before the owner reviews it (in case of a wrong link).

**Priority:** High
**Related Tasks:** TASK-5-02, TASK-5-03
**PRD References:** FR-020, FR-060

### User Journey 5.1 — Contributor Submits Delivery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Sara is accepted for "Add JWT Authentication" (from Sprint 4)           │
│    └─> Sara works on the task locally, creates a branch, writes code       │
│    └─> Sara pushes code and opens a PR on the project's GitHub repo        │
│                                                                             │
│ 2. Sara navigates to her task page on Share-k                              │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ ADD JWT AUTHENTICATION — Status: In Progress                         │ │
│    │ Project: Awesome API by @johndoe                                     │ │
│    │ Deadline: August 15, 2026                                            │ │
│    │                                                                      │ │
│    │ SUBMIT YOUR DELIVERY                                                 │ │
│    │ Pull Request URL:                                                     │ │
│    │ [https://github.com/johndoe/awesome-api/pull/42___________]          │ │
│    │                                                                      │ │
│    │ [Submit Delivery]                                                    │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 3. Sara clicks "Submit Delivery"                                           │
│    └─> System validates the PR URL format ✅                               │
│    └─> Task status → "Delivery Submitted"                                 │
│    └─> Success toast: "Delivery submitted! The project owner will          │
│        review your work."                                                  │
│                                                                             │
│ 4. Owner Notification                                                       │
│    └─> @johndoe receives notification: "Sara has submitted a delivery     │
│        for 'Add JWT Authentication'. Review now →"                         │
│                                                                             │
│ 5. Error Handling                                                           │
│    ├─> Invalid URL → "Please enter a valid GitHub pull request URL."      │
│    ├─> URL is not a PR → "This doesn't appear to be a pull request link." │
│    └─> Already submitted → Option to update the link                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 2: Owner Delivery Review

### User Story 5.2 — Review and Approve/Reject a Contribution Delivery

> **As a** project owner,
> **I want to** review a contributor's submitted pull request and approve or reject the delivery,
> **So that** I can verify the quality of work before it counts as a completed contribution.

**Acceptance Criteria:**

- Owner sees submitted deliveries in their dashboard with a "Review" button.
- The review page shows: PR link (clickable to GitHub), task details, contributor info.
- Owner can:
  - **Approve** — marks the contribution as completed.
  - **Reject** — marks the delivery as rejected with a required reason.
- On approval, the system triggers reputation updates for the contributor.
- On rejection, the contributor is notified with the owner's feedback.

**Priority:** High
**Related Tasks:** TASK-5-02, TASK-5-03
**PRD References:** FR-007, FR-008, FR-061

### User Story 5.3 — Rate and Leave Feedback for a Contributor

> **As a** project owner,
> **I want to** rate a contributor and leave textual feedback after reviewing their delivery,
> **So that** the contributor's reputation profile reflects the quality of their work.

**Acceptance Criteria:**

- After approving a delivery, the owner is prompted to rate and give feedback.
- Rating is on a 1–5 star scale.
- Textual feedback is optional but encouraged.
- Rating and feedback are stored and linked to the contribution record.
- These feed into the contributor's reputation profile.

**Priority:** High
**Related Tasks:** TASK-5-02, TASK-5-03
**PRD References:** FR-009, FR-062, FR-063

### User Journey 5.2–5.3 — Owner Reviews Delivery and Rates Contributor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Owner @johndoe logs in → notification:                                  │
│    "Sara submitted delivery for 'Add JWT Authentication'. Review now →"    │
│                                                                             │
│ 2. Delivery Review Page                                                     │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ DELIVERY REVIEW                                                      │ │
│    │                                                                      │ │
│    │ Task: Add JWT Authentication                                         │ │
│    │ Contributor: Sara Ahmed (@sara-dev)                                  │ │
│    │ Submitted: July 5, 2026                                              │ │
│    │                                                                      │ │
│    │ Pull Request:                                                         │ │
│    │ 🔗 https://github.com/johndoe/awesome-api/pull/42                   │ │
│    │ (opens in new tab to view code changes)                              │ │
│    │                                                                      │ │
│    │ Task Requirements:                                                    │ │
│    │ ✅ JWT authentication (login/register)                               │ │
│    │ ✅ Token generation and refresh                                       │ │
│    │ ✅ Protected route middleware                                         │ │
│    │                                                                      │ │
│    │ [Approve ✅]  [Reject ❌]                                            │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 3a. APPROVE PATH                                                           │
│    └─> Owner clicks "Approve"                                              │
│    └─> Rating & Feedback modal appears:                                    │
│                                                                             │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ RATE CONTRIBUTOR                                                     │ │
│    │                                                                      │ │
│    │ How was Sara's contribution?                                         │ │
│    │ ⭐⭐⭐⭐⭐ (5/5)                                                    │ │
│    │                                                                      │ │
│    │ Feedback (optional):                                                 │ │
│    │ [Clean code, well-structured JWT implementation.                     │ │
│    │  Refresh token logic was exactly what I needed. Great work!__]       │ │
│    │                                                                      │ │
│    │ [Submit Rating]                                                      │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│    └─> Task status → "Completed" ✅                                       │
│    └─> Sara is notified: "🎉 Your delivery for 'Add JWT Authentication'  │
│        has been approved! Rating: ⭐⭐⭐⭐⭐"                             │
│    └─> Reputation system is updated (see Feature 3)                        │
│                                                                             │
│ 3b. REJECT PATH                                                            │
│    └─> Owner clicks "Reject"                                               │
│    └─> Rejection reason modal:                                             │
│                                                                             │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ REJECTION REASON (required)                                          │ │
│    │ [The implementation doesn't handle token expiration correctly.       │ │
│    │  The refresh token endpoint returns a 500 error. Please fix         │ │
│    │  and resubmit._________________________________________________]    │ │
│    │                                                                      │ │
│    │ [Submit Rejection]                                                   │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│    └─> Task status → "Delivery Rejected"                                  │
│    └─> Sara is notified: "Your delivery was rejected. Feedback:           │
│        'Token expiration not handled, refresh returns 500.'"              │
│    └─> Sara can fix the issue, update the PR, and resubmit                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 3: Reputation System

### User Story 5.4 — Build a Reputation Profile from Completed Contributions

> **As a** contributor,
> **I want** my reputation profile to automatically update based on my completed contributions and owner ratings,
> **So that** project owners can see my track record and trust my abilities.

**Acceptance Criteria:**

- After a delivery is approved and rated, the contributor's reputation record is updated:
  - **Overall rating** — average of all owner ratings received.
  - **Completed contribution count** — incremented by 1.
  - **Success rate** — (approved deliveries / total assigned tasks) × 100.
  - **Top verified skills** — most frequently validated skills from completed tasks.
- Only approved contribution outcomes and owner ratings affect reputation metrics.
- Rejected deliveries affect the success rate but do not generate a rating entry.

**Priority:** High
**Related Tasks:** TASK-5-04
**PRD References:** FR-021, FR-065, FR-066, FR-067, FR-068, FR-069, FR-070, FR-071

### User Story 5.5 — View a Contributor's Public Reputation Profile

> **As a** project owner (or any user),
> **I want to** view a contributor's public reputation profile,
> **So that** I can assess their track record before accepting their application.

**Acceptance Criteria:**

- A public profile page is accessible for each contributor.
- The profile shows: overall rating, completed task count, success rate, and top verified skills.
- Owner ratings and feedback are visible (anonymized or attributed, TBD).
- The profile is linked from application review screens and task cards.
- Reputation data reflects verified platform activity, not self-declared claims.

**Priority:** Medium
**Related Tasks:** TASK-5-06
**PRD References:** FR-066, FR-072

### User Journey 5.4–5.5 — Reputation Update and Profile View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Trigger: Sara's delivery for "Add JWT Authentication" is APPROVED       │
│    └─> Owner gave: ⭐⭐⭐⭐⭐ (5/5)                                      │
│    └─> System dispatches: DeliveryApproved event                           │
│                                                                             │
│ 2. Reputation Service Reacts                                                │
│    └─> Reads current reputation record for Sara                            │
│    └─> Updates metrics:                                                    │
│        ┌─────────────────────────────────────────────────────────┐         │
│        │ BEFORE                   │ AFTER                        │         │
│        │ Rating: 4.6              │ Rating: 4.7                  │         │
│        │ Completed: 12            │ Completed: 13                │         │
│        │ Success Rate: 92%        │ Success Rate: 93%            │         │
│        │ Top Skills: React, TS    │ Top Skills: React, TS, Node  │         │
│        └─────────────────────────────────────────────────────────┘         │
│                                                                             │
│ 3. Sara's Reputation Profile Page                                           │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ 👤 SARA AHMED (@sara-dev)                                            │ │
│    │                                                                      │ │
│    │ ⭐ Overall Rating: 4.7 / 5.0                                        │ │
│    │ ✅ Completed Tasks: 13                                               │ │
│    │ 📊 Success Rate: 93%                                                 │ │
│    │                                                                      │ │
│    │ 🏆 TOP VERIFIED SKILLS                                               │ │
│    │ • React — Advanced (verified in 6 tasks)                             │ │
│    │ • TypeScript — Advanced (verified in 5 tasks)                        │ │
│    │ • Node.js — Intermediate (verified in 3 tasks)                       │ │
│    │                                                                      │ │
│    │ 📝 RECENT REVIEWS                                                    │ │
│    │ ⭐⭐⭐⭐⭐ — "Clean code, well-structured JWT implementation."     │ │
│    │ ⭐⭐⭐⭐ — "Good work on the dashboard, minor CSS issues."          │ │
│    │ ⭐⭐⭐⭐⭐ — "Excellent React component architecture."              │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 4. How Reputation Is Used                                                   │
│    └─> Owners see reputation in application review (Sprint 4)              │
│    └─> AI Matching Agent uses reputation as a signal (Sprint 6)            │
│    └─> Higher reputation → better matching rank for future tasks           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 4: Skill Gap Guidance (Gold Tier)

### User Story 5.6 — Receive AI Skill Gap Guidance After Rejection

> **As a** Gold-tier contributor who was rejected by the AI validation gate,
> **I want to** receive detailed guidance on what skills I'm missing and how to improve,
> **So that** I can upskill and become eligible for similar tasks in the future.

**Acceptance Criteria:**

- Only Gold-tier contributors receive skill-gap guidance on rejection (Bronze/Silver receive only the standard rejection notice).
- The guidance includes:
  - **Missing skills** — what the task requires that the contributor lacks.
  - **Recommended technologies** — related tools/frameworks to learn.
  - **Suggested learning resources** — courses, tutorials, documentation links.
  - **Practice projects** — project ideas to build the missing skills.
  - **Estimated improvement path** — rough timeline (where available).
- Guidance is generated by the Skill Gap Guidance Agent using RAG evidence.
- Guidance supports streamed responses for longer content.
- Source attribution is included when evidence exists.

**Priority:** High
**Related Tasks:** TASK-5-05
**PRD References:** FR-057, FR-082, FR-092

### User Journey 5.6 — Gold Contributor Receives Skill Gap Guidance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Gold-tier contributor "Mona" applies to "Build ML Data Pipeline"        │
│    └─> Required: Python, Pandas, Apache Airflow, Docker (Advanced)         │
│    └─> Mona's approved skills: Python (Advanced), Pandas (Intermediate)    │
│    └─> Missing: Apache Airflow, Docker at Advanced level                   │
│                                                                             │
│ 2. AI Validation → INELIGIBLE                                              │
│    └─> Decision: Ineligible (confidence: 88%)                              │
│    └─> Missing: Apache Airflow (none), Docker (Beginner, needs Advanced)   │
│                                                                             │
│ 3. Standard Rejection Notice (same as all tiers)                           │
│    └─> "Your application for 'Build ML Data Pipeline' was not eligible.   │
│        Missing skills: Apache Airflow, Docker (Advanced level needed)."    │
│                                                                             │
│ 4. Gold-Exclusive: Skill Gap Guidance                                      │
│    └─> System detects Mona is Gold-tier → triggers Skill Gap Agent         │
│    └─> Agent runs with: Mona's skills + task requirements + RAG evidence   │
│    └─> Guidance is streamed to the UI:                                     │
│                                                                             │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ 🎓 SKILL GAP GUIDANCE (Gold Exclusive)                               │ │
│    │                                                                      │ │
│    │ 📌 MISSING SKILLS                                                    │ │
│    │ 1. Apache Airflow — You have no recorded experience with Airflow.    │ │
│    │    This is a workflow orchestration tool commonly used for data       │ │
│    │    pipeline scheduling and management.                               │ │
│    │                                                                      │ │
│    │ 2. Docker — You have Beginner-level Docker skills, but this task     │ │
│    │    requires Advanced proficiency (multi-stage builds, orchestration). │ │
│    │                                                                      │ │
│    │ 📚 RECOMMENDED LEARNING RESOURCES                                    │ │
│    │ • "Apache Airflow: The Hands-On Guide" — Udemy                      │ │
│    │ • Official Airflow Docs: airflow.apache.org/docs                    │ │
│    │ • "Docker Deep Dive" — Nigel Poulton                                │ │
│    │ • Docker official tutorial: docs.docker.com/get-started             │ │
│    │                                                                      │ │
│    │ 🛠️ PRACTICE PROJECT IDEAS                                           │ │
│    │ 1. Build an ETL pipeline with Airflow + Pandas + PostgreSQL          │ │
│    │ 2. Create a multi-container app with Docker Compose + networking     │ │
│    │ 3. Deploy an Airflow DAG that processes CSV files on a schedule      │ │
│    │                                                                      │ │
│    │ 📈 ESTIMATED PATH                                                    │ │
│    │ With focused effort:                                                 │ │
│    │ • Airflow basics: ~2 weeks (tutorials + 1 practice project)         │ │
│    │ • Docker Advanced: ~1 week (you already have basics)                │ │
│    │ • Combined readiness: ~3–4 weeks                                    │ │
│    │                                                                      │ │
│    │ 📋 Sources: Based on your GitHub profile analysis and curated        │ │
│    │ learning resources indexed in Share-k's knowledge base.              │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 5. Mona's Next Steps                                                        │
│    └─> Mona bookmarks the guidance                                         │
│    └─> After learning, she updates her GitHub with new projects            │
│    └─> Her skill profile can be re-generated or updated (future feature)   │
│    └─> She applies again when ready                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 5: Contribution Lifecycle Status Tracking

### User Story 5.7 — Track Contribution Status Through the Full Lifecycle

> **As a** contributor or project owner,
> **I want to** see clear status progression through the entire contribution lifecycle,
> **So that** I always know where a contribution stands.

**Acceptance Criteria:**

- The system maintains status through these stages:
  1. **Applied** — contributor submitted an application
  2. **AI Validating** — AI validation is in progress
  3. **Eligible** — passed AI validation, pending owner review
  4. **Ineligible** — failed AI validation
  5. **Accepted** — owner accepted the application
  6. **Owner Rejected** — owner rejected the application
  7. **In Progress** — contributor is working on the task
  8. **Delivery Submitted** — PR link submitted
  9. **Delivery Approved** — owner approved the delivery
  10. **Delivery Rejected** — owner rejected the delivery (can resubmit)
  11. **Completed** — task fully done, reputation updated
- Both contributors and owners see status in their respective dashboards.
- Status transitions trigger appropriate notifications.

**Priority:** High
**Related Tasks:** TASK-5-02
**PRD References:** FR-064

### User Journey 5.7 — Full Contribution Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ① Applied ──→ ② AI Validating ──→ ③ Eligible ──→ ⑤ Accepted             │
│                     │                                     │                 │
│                     ▼                                     ▼                 │
│               ④ Ineligible                         ⑦ In Progress           │
│               (end for this app)                          │                 │
│                                                           ▼                 │
│                                              ⑧ Delivery Submitted          │
│                                                    │           │            │
│                                                    ▼           ▼            │
│                                    ⑨ Delivery Approved   ⑩ Delivery Rejected│
│                                           │                    │            │
│                                           ▼              (can resubmit)     │
│                                     ⑪ Completed                             │
│                                  (reputation updated)                       │
│                                                                             │
│  Alternatively from ③:                                                      │
│  ③ Eligible ──→ ⑥ Owner Rejected (end for this app)                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Sprint 5 Summary Table

| Story ID | User Story | Actor | Priority | Tasks |
|----------|-----------|-------|----------|-------|
| US-5.1 | Submit PR as Delivery | Contributor | High | TASK-5-02, TASK-5-03 |
| US-5.2 | Review/Approve/Reject Delivery | Project Owner | High | TASK-5-02, TASK-5-03 |
| US-5.3 | Rate and Leave Feedback | Project Owner | High | TASK-5-02, TASK-5-03 |
| US-5.4 | Build Reputation from Contributions | System / Contributor | High | TASK-5-04 |
| US-5.5 | View Public Reputation Profile | All Users | Medium | TASK-5-06 |
| US-5.6 | Receive Skill Gap Guidance (Gold) | Gold Contributor | High | TASK-5-05 |
| US-5.7 | Track Contribution Lifecycle | All Users | High | TASK-5-02 |
