# Sprint 6 — Premium Tiers and Contributor Matching

**Sprint Goal:** Enforce owner and contributor premium limits while enabling AI contributor matching and premium task recommendations.
**Duration:** Week 6

---

## Feature 1: Subscription Plan Enforcement

### User Story 6.1 — Enforce Owner Monthly Order Limits

> **As the** system,
> **I want to** enforce monthly contribution order limits based on the owner's subscription plan,
> **So that** plan tiers provide genuine differentiation and free/lower-tier users don't exceed their allowance.

**Acceptance Criteria:**

- Plan limits:
  - **Bronze**: up to 10 contribution orders/month
  - **Silver**: up to 20 contribution orders/month
  - **Gold**: up to 30 contribution orders/month
- Limits are checked at contribution request creation time.
- If the limit is reached, the creation is blocked with a clear message.
- The count resets at the start of each calendar month.
- Plan upgrades take effect immediately for future orders (existing orders are not affected).
- Plan downgrades do not revoke already-created orders.

**Priority:** High
**Related Tasks:** TASK-6-02
**PRD References:** FR-010, FR-050, FR-073, FR-074, FR-075, FR-076

### User Story 6.2 — Enforce Contributor Daily Application Limits

> **As the** system,
> **I want to** enforce daily application limits based on the contributor's subscription plan,
> **So that** plan tiers provide value and application quality is encouraged over volume.

**Acceptance Criteria:**

- Plan limits:
  - **Bronze**: up to 2 applications/day
  - **Silver**: up to 3 applications/day
  - **Gold**: up to 4 applications/day
- Limits are checked at application submission time (before AI validation triggers).
- If the limit is reached, the contributor sees: "You've reached your daily limit. Try again tomorrow or upgrade your plan."
- The count resets at midnight (user's local time or server time, TBD).
- Plan changes take effect immediately.

**Priority:** High
**Related Tasks:** TASK-6-02
**PRD References:** FR-022, FR-078, FR-079, FR-080, FR-081

### User Journey 6.1–6.2 — Plan Limit Enforcement

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO A: OWNER HITS MONTHLY LIMIT                                        │
│                                                                             │
│ 1. Owner @johndoe (Bronze plan) tries to create 11th order this month      │
│    └─> System checks: Bronze limit = 10, current count = 10                │
│                                                                             │
│ 2. Creation Blocked                                                         │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ ⚠️ MONTHLY ORDER LIMIT REACHED                                      │ │
│    │                                                                      │ │
│    │ You've used 10/10 contribution orders this month (Bronze plan).      │ │
│    │                                                                      │ │
│    │ Your limit resets on August 1, 2026.                                 │ │
│    │                                                                      │ │
│    │ Want more? Upgrade your plan:                                        │ │
│    │ • Silver: 20 orders/month + AI matching (top 5)                     │ │
│    │ • Gold: 30 orders/month + AI matching (top 10) + priority visibility│ │
│    │                                                                      │ │
│    │ [Upgrade Plan]  [Got It]                                             │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO B: CONTRIBUTOR HITS DAILY LIMIT                                    │
│                                                                             │
│ 1. Contributor "Omar" (Bronze plan) tries to apply for a 3rd task today    │
│    └─> System checks: Bronze limit = 2/day, today's count = 2             │
│                                                                             │
│ 2. Application Blocked                                                      │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ ⚠️ DAILY APPLICATION LIMIT REACHED                                   │ │
│    │                                                                      │ │
│    │ You've used 2/2 applications today (Bronze plan).                    │ │
│    │                                                                      │ │
│    │ Your limit resets tomorrow at midnight.                              │ │
│    │                                                                      │ │
│    │ Upgrade for more daily applications:                                 │ │
│    │ • Silver: 3 applications/day + skill-matched notifications          │ │
│    │ • Gold: 4 applications/day + AI-recommended tasks + skill guidance   │ │
│    │                                                                      │ │
│    │ [Upgrade Plan]  [Got It]                                             │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 2: Plan Status and Benefits Display

### User Story 6.3 — View My Plan Status and Benefits

> **As a** user (owner or contributor),
> **I want to** see my current subscription plan, usage, and available benefits,
> **So that** I understand what I can do and what's available at higher tiers.

**Acceptance Criteria:**

- Dashboard shows current plan name (Bronze/Silver/Gold), current usage vs limits, and a list of included benefits.
- Benefits differ by role:
  - **Owner benefits**: order limits, AI matching, priority visibility, notifications, commission.
  - **Contributor benefits**: application limits, notifications, AI recommendations, skill-gap guidance, commission.
- An "Upgrade Plan" CTA is visible for non-Gold users.
- Plan benefits are understandable at order creation, application, matching, and notification moments.

**Priority:** High
**Related Tasks:** TASK-6-05
**PRD References:** FR-010, FR-022

### User Journey 6.3 — Viewing Plan Status

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Owner @johndoe navigates to "My Plan" in settings                       │
│                                                                             │
│ 2. Plan Status Display                                                      │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ 📋 YOUR PLAN: SILVER                                                 │ │
│    │                                                                      │ │
│    │ USAGE THIS MONTH                                                     │ │
│    │ Orders: ████████░░░░░░░░░░░░ 8/20                                   │ │
│    │                                                                      │ │
│    │ YOUR BENEFITS                                                        │ │
│    │ ✅ Up to 20 contribution orders/month                                │ │
│    │ ✅ AI contributor matching (top 5 per task)                           │ │
│    │ ✅ Priority visibility in project listings                           │ │
│    │ ❌ Auto-notification to best-matching contributors (Gold only)       │ │
│    │ ❌ No platform commission (Gold only)                                │ │
│    │                                                                      │ │
│    │ [Upgrade to Gold →]                                                  │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 3: AI Contributor Matching

### User Story 6.4 — Get AI-Matched Contributors for My Task (Silver/Gold Owners)

> **As a** Silver or Gold project owner,
> **I want to** receive an AI-generated list of top matching contributors for my contribution request,
> **So that** I can proactively invite the best-fit contributors instead of waiting for applications.

**Acceptance Criteria:**

- When a Silver owner publishes a contribution request, the system runs the Contributor Matching Agent.
- The agent considers: approved contributor skills, task requirements, reputation signals, and RAG evidence.
- Results:
  - **Silver**: top 5 matching contributors.
  - **Gold**: top 10 matching contributors.
- Each match includes: contributor name, match score, confidence, justification, and key matching skills.
- Owner can view the matched list from the contribution request detail page.
- Owner can invite a matched contributor (sends a notification encouraging them to apply).
- Bronze owners do not see matching results.

**Priority:** High
**Related Tasks:** TASK-6-03, TASK-6-04
**PRD References:** FR-074, FR-075, FR-077, FR-093

### User Journey 6.4 — AI Contributor Matching

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Silver owner @johndoe publishes "Add JWT Authentication"                │
│    └─> System triggers Contributor Matching Agent                          │
│                                                                             │
│ 2. Agent Execution                                                          │
│    └─> Input: task requirements (Node.js, JWT, Express, Intermediate)      │
│    └─> Searches: all active contributors with approved skills              │
│    └─> Considers: skill match, proficiency level, reputation, RAG evidence │
│    └─> Returns: top 5 ranked matches (Silver plan)                         │
│                                                                             │
│ 3. Match Results View                                                       │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ 🤖 AI-MATCHED CONTRIBUTORS (Silver Benefit)                          │ │
│    │ For: "Add JWT Authentication"                                        │ │
│    │                                                                      │ │
│    │ #1 Sara Ahmed (@sara-dev) — Match: 94%                               │ │
│    │    Skills: Node.js (Int.), Express (evidence), JWT (evidence)         │ │
│    │    Reputation: ⭐ 4.7 · 13 completed · 93% success                   │ │
│    │    "Strong Node.js/Express background with JWT usage in 2 repos."    │ │
│    │    [Invite to Apply]                                                  │ │
│    │                                                                      │ │
│    │ #2 Khaled Hassan (@khaled-dev) — Match: 87%                          │ │
│    │    Skills: Node.js (Adv.), Express (evidence)                         │ │
│    │    Reputation: ⭐ 4.5 · 8 completed · 88% success                    │ │
│    │    "Advanced Node.js developer. No direct JWT evidence but strong    │ │
│    │    auth experience."                                                  │ │
│    │    [Invite to Apply]                                                  │ │
│    │                                                                      │ │
│    │ #3–5: Additional matches...                                          │ │
│    │                                                                      │ │
│    │ 💡 Upgrade to Gold for top 10 matches + auto-notifications           │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 4. Owner Invites Sara                                                       │
│    └─> Clicks "Invite to Apply"                                            │
│    └─> Sara receives notification: "You've been matched to a task by      │
│        @johndoe! View 'Add JWT Authentication' →"                          │
│    └─> Sara can choose to apply (still subject to AI validation)           │
│                                                                             │
│ 5. Gold Owner Additional Benefits                                           │
│    └─> Top 10 matches instead of 5                                         │
│    └─> Auto-notification sent to best-matching contributors without        │
│        manual "Invite" action                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 4: Premium Contributor Benefits

### User Story 6.5 — Receive AI-Recommended Tasks (Gold Contributors)

> **As a** Gold-tier contributor,
> **I want to** receive AI-recommended tasks based on my skills and activity,
> **So that** I can discover the most relevant opportunities without manual browsing.

**Acceptance Criteria:**

- Gold contributors see a "Recommended for You" section on their dashboard.
- Recommendations are powered by the AI Matching Agent running in reverse (matching tasks to contributor).
- Each recommendation shows: task title, match relevance, and why it's a good fit.
- Bronze and Silver contributors see this section grayed out with a "Upgrade to Gold" prompt.

**Priority:** High
**Related Tasks:** TASK-6-04, TASK-6-05
**PRD References:** FR-080

### User Story 6.6 — Receive Skill-Matched Task Notifications (Silver/Gold)

> **As a** Silver or Gold contributor,
> **I want to** receive notifications when new tasks matching my skills are published,
> **So that** I can be among the first to apply for relevant opportunities.

**Acceptance Criteria:**

- When a new contribution request is published, the system checks if any Silver/Gold contributors have matching approved skills.
- Matching contributors receive an in-app notification: "New task matching your skills: [task title]"
- Bronze contributors receive only basic task notifications (generic, not skill-matched).
- Gold contributors get priority visibility (their applications may appear first to owners).

**Priority:** High
**Related Tasks:** TASK-6-04
**PRD References:** FR-078, FR-079, FR-080

### User Journey 6.5–6.6 — Premium Contributor Experience

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Gold contributor "Sara" logs in                                         │
│                                                                             │
│ 2. Dashboard — Recommended Tasks Section                                    │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ 🎯 RECOMMENDED FOR YOU (Gold Benefit)                                │ │
│    │                                                                      │ │
│    │ ┌────────────────────────────────────────────────────────────────┐   │ │
│    │ │ Build GraphQL API — 92% match                                 │   │ │
│    │ │ 📦 Project: Social Media Platform                             │   │ │
│    │ │ Why: Matches your TypeScript (Adv.), Node.js (Int.) skills    │   │ │
│    │ │ ⚡ Intermediate · 💰 $75 · 📅 Due: Aug 20                    │   │ │
│    │ │ [View & Apply →]                                              │   │ │
│    │ └────────────────────────────────────────────────────────────────┘   │ │
│    │                                                                      │ │
│    │ ┌────────────────────────────────────────────────────────────────┐   │ │
│    │ │ Implement React Testing Suite — 88% match                     │   │ │
│    │ │ 📦 Project: Dashboard UI                                      │   │ │
│    │ │ Why: Matches your React (Adv.), TypeScript (Adv.) skills      │   │ │
│    │ │ ⚡ Intermediate · 📅 Due: Aug 25                              │   │ │
│    │ │ [View & Apply →]                                              │   │ │
│    │ └────────────────────────────────────────────────────────────────┘   │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 3. Notification Received                                                    │
│    └─> 🔔 "New task matching your skills: 'Build GraphQL API'              │
│        92% match with your TypeScript and Node.js skills."                 │
│    └─> Sara clicks notification → lands on task detail page                │
│    └─> Sara applies → goes through normal AI validation flow               │
│                                                                             │
│ 4. Bronze/Silver Contributor View (for comparison)                          │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ 🎯 RECOMMENDED FOR YOU                                               │ │
│    │ 🔒 Upgrade to Gold to unlock AI-recommended tasks personalized      │ │
│    │    to your skills and activity.                                       │ │
│    │ [Upgrade to Gold →]                                                  │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature 5: Reports and Disputes

### User Story 6.7 — Report an Issue (Any User)

> **As a** user,
> **I want to** report issues like fraud, misuse, or inaccurate AI decisions,
> **So that** the platform can investigate and maintain trust.

**Acceptance Criteria:**

- A "Report" option is accessible from relevant context (project page, contribution, user profile).
- The report form includes: category (fraud, misuse, inaccurate AI, other), description, and relevant links.
- Reports are stored and visible to admins in a review queue.
- The reporter receives confirmation: "Your report has been submitted."

**Priority:** Medium
**Related Tasks:** TASK-6-06
**PRD References:** FR-025, FR-026, NFR-002

### User Story 6.8 — Dispute an AI Decision (Contributor)

> **As a** contributor,
> **I want to** dispute an AI skill profile or validation decision that I believe is inaccurate,
> **So that** an admin can review and correct the assessment.

**Acceptance Criteria:**

- Dispute option is available from: skill profile (for incorrect skill assessments) and application rejection (for incorrect validation decisions).
- The dispute form includes: which decision is disputed, why the contributor disagrees, and any supporting evidence.
- Disputes are stored and visible to admins.
- Disputed skill claims never silently qualify a contributor — they remain in a disputed state until resolved.
- Admin can: uphold the AI decision, adjust the skill, or override the validation.

**Priority:** Medium
**Related Tasks:** TASK-6-06
**PRD References:** FR-059, FR-058, NFR-002

### User Journey 6.7–6.8 — Reports and Disputes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO A: CONTRIBUTOR DISPUTES AI SKILL ASSESSMENT                        │
│                                                                             │
│ 1. Contributor "Khaled" sees his Docker skill was assessed as Beginner     │
│    └─> He believes he should be Intermediate based on his projects         │
│    └─> Clicks "Dispute this assessment" on his skill profile               │
│                                                                             │
│ 2. Dispute Form                                                            │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ DISPUTE AI ASSESSMENT                                                │ │
│    │                                                                      │ │
│    │ Disputed Skill: Docker — Beginner                                    │ │
│    │                                                                      │ │
│    │ Why do you disagree?                                                 │ │
│    │ [I have 3 repos using Docker with multi-stage builds and             │ │
│    │  docker-compose. My devops-toolkit repo has complex Dockerfiles      │ │
│    │  that weren't picked up by the analysis.___________________________]│ │
│    │                                                                      │ │
│    │ Supporting links (optional):                                         │ │
│    │ [https://github.com/khaled/devops-toolkit____________________]      │ │
│    │                                                                      │ │
│    │ [Submit Dispute]                                                     │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 3. After Submission                                                         │
│    └─> Docker skill status → "Disputed" (cannot qualify for tasks)         │
│    └─> Admin sees dispute in review queue                                  │
│    └─> Admin reviews evidence, decides:                                    │
│        ├─> Uphold → stays Beginner, dispute closed                         │
│        ├─> Adjust → change to Intermediate, approve, dispute resolved     │
│        └─> Re-analyze → trigger re-ingestion for specific repos            │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO B: USER REPORTS FRAUDULENT PROFILE                                │
│                                                                             │
│ 1. Owner notices a contributor's profile looks suspicious                   │
│    └─> Clicks "⚠️ Report" on the contributor's profile                    │
│                                                                             │
│ 2. Report Form                                                             │
│    └─> Category: [Fraud / Misuse ▼]                                       │
│    └─> Description: "This user seems to have forked popular repos to      │
│        inflate their skill profile without contributing."                   │
│    └─> Clicks "Submit Report"                                              │
│                                                                             │
│ 3. Admin Review                                                            │
│    └─> Admin investigates the report                                       │
│    └─> If confirmed → admin can suspend the account                       │
│    └─> Reporter receives: "Thank you. We've reviewed your report."        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Sprint 6 Summary Table

| Story ID | User Story | Actor | Priority | Tasks |
|----------|-----------|-------|----------|-------|
| US-6.1 | Enforce Owner Order Limits | System | High | TASK-6-02 |
| US-6.2 | Enforce Contributor App Limits | System | High | TASK-6-02 |
| US-6.3 | View Plan Status & Benefits | All Users | High | TASK-6-05 |
| US-6.4 | AI Contributor Matching | Silver/Gold Owner | High | TASK-6-03, TASK-6-04 |
| US-6.5 | AI-Recommended Tasks | Gold Contributor | High | TASK-6-04, TASK-6-05 |
| US-6.6 | Skill-Matched Notifications | Silver/Gold Contributor | High | TASK-6-04 |
| US-6.7 | Report an Issue | All Users | Medium | TASK-6-06 |
| US-6.8 | Dispute AI Decision | Contributor | Medium | TASK-6-06 |
