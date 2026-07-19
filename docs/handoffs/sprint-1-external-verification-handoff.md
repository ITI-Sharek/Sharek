# Sprint 1 External Verification Handoff

## Purpose

Verify Jira Sprint 1 work that is outside the Share-k NestJS backend. Do not
change the backend repository as part of this handoff.

## Source Issues

- `SK-103` / `TASK-1-01`: core UX flows and design-system baseline.
- `SK-104` / `TASK-1-02`: client app shell and shared UI components.
- `SK-108` / `TASK-1-06`: AI, RAG, and Pinecone contracts.

Jira board: <https://karimmuhammad.atlassian.net/jira/software/projects/SK/boards/34/backlog>

## Client Agent Scope

Work only in the client repository.

Verify:

1. Registration, GitHub connection, role selection, project publishing,
   discovery, and task-application flows exist at the UX-contract level.
2. The TanStack app shell, routes, navigation, authentication-aware layouts,
   forms, feeds, cards, and status badges are implemented.
3. Owner, contributor, and admin layouts are responsive.
4. Accessibility notes and WCAG 2.1 AA expectations are covered.
5. Arabic and English layout behavior, including RTL expectations, is tested.

Return:

- files inspected or changed;
- tests and build commands;
- acceptance criteria that pass;
- missing work, risks, and screenshots where useful.

## AI Agent Scope

Work only in the AI repository.

Verify:

1. The selected LLM, embedding approach, orchestration approach, and vector
   storage approach are explicit and configuration-driven.
2. Agent input and output contracts are structured and versioned.
3. Skill-profile output contains skill, proficiency, confidence, and exact
   source attribution compatible with the NestJS backend contract.
4. Failure paths cover timeout, malformed output, low confidence, missing
   evidence, and unknown evidence citations.
5. The internal bearer token is required for AI generation endpoints, while
   health remains safe for operational checks.
6. Contract tests cover compatibility with the backend DTOs described in
   `docs/api-contracts.md` and `src/modules/ai/dto/skill-profile-ai.dto.ts`.

Do not request backend changes without describing the exact route, schema
version, DTO field, compatibility impact, and acceptance test needed.

Return:

- configuration and contract files inspected or changed;
- AI tests executed and results;
- compatibility result against the NestJS contract;
- remaining RAG/vector-store work and whether it is Sprint 1 foundation or a
  later implementation task.

## Backend Contract Reference

The backend owns authorization, final business decisions, database writes, and
audit snapshots. The AI service returns recommendations only. The client calls
the NestJS backend only and must not call the AI service or model provider
directly.
