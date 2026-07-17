---
title: "PRD: Grad_Project"
status: draft
created: 2026-06-17
updated: 2026-06-17
---

# PRD: Grad_Project

## Source Basis

This PRD section is drafted from the following primary source documents supplied for Share-k:

- `docs/Sharek_Core_Features_Documentation.docx`
- `Sharek_Comprehensive_documentation.docx`
- `Sharek_Project_Pitch.docx`
- `شارك_share-k_mvp_scope.pdf`

The core feature set, user roles, AI Trinity, and premium tiers are treated as locked product direction.

## Core Features Documentation

### Product Summary

Share-k is an AI-powered open-source collaboration hub that connects project owners with developers who want to contribute, learn, and build a verified technical reputation. Its core differentiator is that AI validates contributor applications before they reach a project owner, converting an unfiltered application flow into a pre-qualified shortlist while giving contributors a structured path to improve.

The MVP must support three outcomes:

- Project owners can publish GitHub-based projects, create contribution tasks, and receive only AI-prevalidated applicants for review.
- Contributors can build an AI-verified skill profile, discover matching projects and tasks, apply to contribution opportunities, submit pull requests, and grow a verified reputation.
- Admin/support users can review AI-generated trust signals, prevent misuse, and preserve confidence in the platform's reputation economy.

### User Roles and Permissions

#### Project Owner

Project owners are developers or teams that publish open-source projects and request contribution work.

Functional requirements:

- FR-001: The system must allow a project owner to connect a GitHub account.
- FR-002: The system must allow a project owner to add a project using a GitHub repository URL.
- FR-003: The system must allow a project owner to review and edit auto-fetched project metadata before publication.
- FR-004: The system must allow a project owner to create, publish, and manage contribution requests for their projects.
- FR-005: The system must show project owners only contributor applications that pass AI validation, except where an admin override or review flow explicitly permits otherwise.
- FR-006: The system must allow a project owner to accept or reject eligible applications.
- FR-007: The system must allow a project owner to review submitted pull request links.
- FR-008: The system must allow a project owner to approve or reject delivered contributions.
- FR-009: The system must allow a project owner to rate contributors and leave feedback after contribution review.
- FR-010: The system must enforce project-owner premium plan limits and benefits.

#### Contributor

Contributors are developers seeking real-world experience, open-source contributions, skill growth, verified reputation, and optionally paid tasks.

Functional requirements:

- FR-011: The system must allow a contributor to register and connect a GitHub account.
- FR-012: The system must generate an initial skill profile from the contributor's GitHub repositories, programming languages, contribution activity, and technologies used.
- FR-013: The system must show skill levels with structured proficiency labels such as Beginner, Intermediate, and Advanced.
- FR-014: The system must keep AI-generated skills pending until admin review approves them for use in eligibility decisions.
- FR-015: The system must allow contributors to browse and filter published projects.
- FR-016: The system must allow contributors to browse contribution requests.
- FR-017: The system must allow contributors to apply to contribution requests subject to plan limits and AI validation.
- FR-018: The system must block ineligible applications before they reach project owners.
- FR-019: The system must explain to an ineligible contributor that they do not currently meet the task requirements.
- FR-020: The system must allow accepted contributors to submit a GitHub pull request link as delivery evidence.
- FR-021: The system must maintain a contributor reputation profile based on completed contributions, owner ratings, success rate, and verified skills.
- FR-022: The system must enforce contributor premium plan limits and benefits.

#### Admin / Support

Admin/support users operate the trust and safety layer of the platform.

Functional requirements:

- FR-023: The system must allow admins to review and approve AI-generated skill profiles before accounts become fully active.
- FR-024: The system must allow admins to validate or correct AI skill assessments.
- FR-025: The system must allow admins to review reported issues.
- FR-026: The system must support admin actions that prevent fraud, misuse, and reputation manipulation.

### Feature 1: Registration and AI Skill Profiling

When a user registers, they connect their GitHub profile. The system fetches repository data, programming languages, contribution activity, and technologies used in projects. The AI Skill Profiling Agent analyzes this evidence and creates a structured skill profile.

Functional requirements:

- FR-027: The system must start GitHub ingestion after a user connects a GitHub account during registration.
- FR-028: The system must fetch repositories, README content, code evidence, programming languages, contribution activity, commit signals, and project technology indicators where available.
- FR-029: The system must generate a structured skill profile containing skill name, proficiency level, confidence, and evidence source.
- FR-030: The system must persist generated skills in a pending state until admin approval.
- FR-031: The system must allow admins to approve, reject, or adjust generated skills.
- FR-032: The system must prevent pending or rejected skills from qualifying a contributor for tasks.
- FR-033: The system must expose enough source attribution for generated skills to support trust, review, and dispute handling.

Acceptance criteria:

- A newly registered contributor cannot become fully active for AI-gated contribution applications until the generated skill profile is reviewed.
- Skill profile output can represent examples such as Python - Advanced, React - Intermediate, and Docker - Beginner.
- Each approved skill is traceable to evidence from the contributor's GitHub activity.

### Feature 2: Project Publishing

Project owners publish open-source projects by submitting a GitHub repository URL. Share-k auto-populates project metadata and lets the owner review it before publication.

Functional requirements:

- FR-034: The system must allow a project owner to submit a GitHub repository URL.
- FR-035: The system must fetch project title, description, programming languages, tags/technologies, and repository statistics.
- FR-036: The system must allow the owner to review and edit fetched metadata before publication.
- FR-037: The system must publish confirmed projects to the projects page.
- FR-038: The system must index published project metadata for keyword filtering and semantic discovery.
- FR-039: The system must associate each project with its owning user or team.

Acceptance criteria:

- A project is not visible to contributors until the owner confirms the reviewed metadata.
- Published project details include enough technology and difficulty information to support discovery and matching.

### Feature 3: Project Discovery

Contributors discover available projects through browsing, filtering, and semantic relevance.

Functional requirements:

- FR-040: The system must display a discovery feed of published projects.
- FR-041: The system must allow filtering by technology stack.
- FR-042: The system must allow filtering by project category.
- FR-043: The system must allow filtering by difficulty level.
- FR-044: The system must support categories including Web Development, Mobile Development, AI / Machine Learning, DevOps, and Tools & Utilities.
- FR-045: The system must use indexed project metadata to surface semantically relevant projects beyond exact keyword matches.

Acceptance criteria:

- Contributors can narrow project listings by technology, category, and difficulty.
- Project discovery supports both structured filters and AI-assisted relevance.

### Feature 4: Contribution Requests / Orders

Project owners create structured contribution tasks for specific work needed in a project.

Functional requirements:

- FR-046: The system must allow project owners to create contribution requests linked to a published project.
- FR-047: Each contribution request must include title, description, required technologies, difficulty level, deadline, and optional reward.
- FR-048: The system must publish contribution requests to an orders or task feed where contributors can discover and apply.
- FR-049: The system must index contribution request requirements for AI validation and contributor matching.
- FR-050: The system must enforce owner monthly order limits based on subscription plan.

Acceptance criteria:

- A valid order can represent a task such as "Add authentication using JWT" with Intermediate difficulty, Node.js/JWT requirements, deadline, and optional reward.
- Contributors can view task requirements before applying.

### Feature 5: AI Validation Gate for Applications

The AI validation gate is Share-k's core differentiator. When a contributor applies to a task, the system compares the contributor's verified skill profile against the task's requirements before the application reaches the project owner.

Functional requirements:

- FR-051: The system must run an AI skill-validation check when a contributor applies to a contribution request.
- FR-052: The validation check must compare task requirements against the contributor's approved skill profile.
- FR-053: The validation result must return an eligibility decision, confidence score, and justification.
- FR-054: If the contributor is eligible, the system must forward the application to the project owner for final review.
- FR-055: If the contributor is ineligible, the system must block the application from reaching the project owner.
- FR-056: If the contributor is ineligible, the system must notify them that they do not currently meet the task requirements.
- FR-057: Gold-tier contributors who are rejected by AI validation must receive skill-gap guidance that identifies missing skills, recommended technologies, suggested learning resources, practice projects, and estimated improvement path where available.
- FR-058: The system must prevent unapproved, low-confidence, or disputed skill claims from silently qualifying a contributor.
- FR-059: The system must support contributor review or dispute paths for inaccurate AI validation outcomes.

Acceptance criteria:

- Project owners do not receive unsuitable applications that fail the AI validation gate.
- Eligible applications still require final owner acceptance.
- Rejected Gold contributors receive actionable guidance instead of only a rejection notice.

### Feature 6: Contribution Delivery and Review

After an owner accepts an application, the contributor completes the task and submits a GitHub pull request link.

Functional requirements:

- FR-060: The system must allow accepted contributors to submit a GitHub pull request link for the assigned contribution request.
- FR-061: The system must allow owners to approve or reject submitted contribution delivery.
- FR-062: The system must allow owners to rate contributors after delivery review.
- FR-063: The system must allow owners to leave textual feedback.
- FR-064: The system must update contribution status throughout application, acceptance, delivery, review, and completion.
- FR-065: Approved contributions must feed the contributor reputation system.

Acceptance criteria:

- A contribution cannot count as completed until the owner approves the submitted work.
- Owner feedback and ratings are captured at the point of delivery review.

### Feature 7: Reputation System

Each contributor builds a transparent reputation profile based on platform activity and verified outcomes.

Functional requirements:

- FR-066: The system must maintain a public contributor reputation profile.
- FR-067: The reputation profile must include overall rating.
- FR-068: The reputation profile must include completed contribution count.
- FR-069: The reputation profile must include success rate.
- FR-070: The reputation profile must include top verified skills.
- FR-071: The system must use approved contribution outcomes and owner ratings as reputation inputs.
- FR-072: The system must make higher reputation available as a signal for future contributor selection and matching.

Acceptance criteria:

- A profile can represent metrics such as rating 4.8, 18 completed tasks, 94% success rate, and top skills such as React and Node.js.
- Reputation is based on verified platform activity rather than only self-declared skills or raw GitHub popularity.

### Feature 8: Premium Subscription Tiers

Share-k includes premium plans for both project owners and contributors in the MVP.

#### Project Owner Plans

Functional requirements:

- FR-073: Bronze owner plan must allow up to 10 contribution orders per month with standard project visibility.
- FR-074: Silver owner plan must allow up to 20 contribution orders per month, AI contributor matching for the top 5 contributors, and priority visibility in project listings.
- FR-075: Gold owner plan must allow up to 30 contribution orders per month, AI contributor matching for the top 10 contributors, priority order visibility, automatic notification to best-matching contributors, and no platform commission on contributor payments.
- FR-076: The system must enforce owner order limits monthly.
- FR-077: The system must expose AI matching benefits only to eligible owner plans.

#### Contributor Plans

Functional requirements:

- FR-078: Bronze contributor plan must allow up to 2 applications per day and basic task notifications.
- FR-079: Silver contributor plan must allow up to 3 applications per day, skill-matched task notifications, and reduced platform commission.
- FR-080: Gold contributor plan must allow up to 4 applications per day, AI-recommended tasks based on skills and activity, AI skill-gap feedback when rejected by validation, no platform commission, and priority application visibility.
- FR-081: The system must enforce contributor daily application limits.
- FR-082: The system must expose Gold skill-gap guidance only to eligible Gold contributors.

Acceptance criteria:

- Plan limits and premium benefits are enforced consistently at the point of order creation, application, matching, notification, and commission handling.
- Premium status changes affect future usage limits and benefits without corrupting existing contribution history.

### AI Trinity Product Behavior

The AI Trinity is a locked part of the Share-k product concept. In the PRD, it defines required product behavior and AI-assisted experiences; detailed architecture belongs in downstream architecture artifacts.

#### LLM Intelligence Layer

Functional requirements:

- FR-083: The system must use an LLM-backed intelligence layer to generate skill profiles, eligibility justifications, feedback narratives, task summaries, and skill-gap guidance.
- FR-084: The system must produce structured outputs for AI skill profiles and validation decisions so downstream workflows can store, review, and act on them.
- FR-085: The system must support streamed AI responses for longer guidance experiences where responsiveness matters.

#### RAG Knowledge Layer

Functional requirements:

- FR-086: The system must retrieve evidence from GitHub README files, code files, commit messages, repository descriptions, contributor profiles, project metadata, task requirements, and curated learning resources.
- FR-087: The system must use retrieved evidence to support skill extraction, contributor-to-task matching, semantic project discovery, and skill-gap guidance.
- FR-088: The system must preserve source attribution for AI-generated skill and guidance claims where evidence is available.
- FR-089: The system must support retrieval quality sufficient for matching contributors to tasks by actual technical fit rather than self-reported skills alone.

#### Agent Action Layer

Functional requirements:

- FR-090: The system must include a GitHub Ingestion and Skill Profiling Agent that creates structured skill profiles from GitHub evidence during registration.
- FR-091: The system must include a Skill Validation Agent that compares verified contributor skills with task requirements on application.
- FR-092: The system must include a Skill Gap Guidance Agent for Gold-tier rejected contributors.
- FR-093: The system must include a Contributor Matching Agent for eligible Silver/Gold owner matching features.
- FR-094: Each AI agent must have a clear trigger, input contract, output contract, and failure-handling path.

Acceptance criteria:

- AI behavior is not decorative; it gates applications, explains eligibility, powers discovery/matching, and creates contributor growth guidance.
- If an AI subsystem fails or returns low-confidence results, the product must degrade to review, retry, or clear user messaging rather than silently making unsupported trust decisions.

### Cross-Feature Trust, Safety, and Quality Requirements

- NFR-001: AI-generated skill claims must be reviewable by admins before they affect contributor eligibility.
- NFR-002: The platform must prevent fraud, misuse, and reputation manipulation through admin review and report handling.
- NFR-003: Skill validation must prioritize explainability, including confidence and justification.
- NFR-004: The platform must support Arabic and English user experience expectations, including RTL layout needs where applicable.
- NFR-005: The platform must support accessibility expectations aligned with WCAG 2.1 Level AA.
- NFR-006: AI validation quality should target greater than 90% accuracy against ground-truth eligibility decisions.
- NFR-007: RAG-backed outputs should target greater than 90% faithfulness to retrieved evidence.
- NFR-008: The platform should target P95 API response time under 3 seconds for non-streaming core interactions.

### Genuine Open Questions

- OQ-001: Should Admin / Support be a fully implemented MVP dashboard role, or can some admin review functions be implemented as a lightweight internal tool for the capstone demo?
- OQ-002: What payment provider and commission mechanics should be used for optional rewards and premium commission rules?
- OQ-003: What exact dispute flow should contributors use when they believe a skill profile or AI validation decision is inaccurate?
