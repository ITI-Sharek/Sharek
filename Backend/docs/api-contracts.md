# API Contracts

## Public API Direction

The frontend calls the NestJS backend only.

```text
Next.js frontend -> NestJS backend -> database/model providers/GitHub
```

The frontend should not call model providers directly.

## REST Guidelines

- Use stable request and response DTOs.
- Validate every request.
- Return domain-safe responses, not raw Prisma rows.
- Use pagination for lists.
- Use explicit status values.
- Return useful error codes and safe error messages.

## Core API Areas

Expected API groups:

```text
/auth
/users
/github
/projects
/contribution-tasks
/applications
/skill-profiles
/admin
/deliveries
/reputation
/health
```

Exact route naming can evolve, but ownership must stay aligned with modules.

## AI Adapter Contracts

AI runs inside the backend through ports/adapters.

Expected ports:

```text
SkillProfileGenerator
EligibilityAnalyzer
SkillGapAdvisor
EmbeddingGenerator
```

AI output must be structured. Example eligibility result:

```json
{
  "recommendation": "manual_review",
  "confidence": 0.68,
  "matchedSkillIds": ["skill_123"],
  "missingSkills": ["Docker"],
  "evidenceIds": ["evidence_123", "evidence_456"],
  "provider": "openai",
  "model": "gpt-4.1-mini",
  "promptVersion": "eligibility-v1",
  "reasonSummary": "Backend evidence is strong, but Docker evidence is weak."
}
```

Allowed recommendations:

```text
eligible
rejected
manual_review
```

The backend may override or transform recommendations according to policy.

## Failure Handling

If an AI provider times out, returns invalid JSON, returns low confidence, or
cannot cite evidence:

- Do not silently approve.
- Retry only when safe.
- Route to manual review when the decision affects eligibility.
- Store an audit record.
- Return a clear user-safe message.

## Contract Change Rules

- Breaking API changes require frontend coordination.
- AI output schema changes require tests.
- DTO changes must be reflected in docs or generated OpenAPI.
- Contract drift should be caught by integration or contract tests.

