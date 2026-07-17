# AI integration via NestJS `AiPort`, not a separate FastAPI service

**Status:** Accepted — supersedes `docs/archive/bmad-output/planning-artifacts/architecture/adr-001-backend-architecture.md`

`adr-001` decided AI implementation would live in a separate FastAPI repository, called through ports/adapters, because it anticipated LangGraph workflows and Python-first embedding/reranking tooling. That anticipated need didn't materialize — MVP AI is one advisory application-fit-analysis call plus an optional skill-narrative call (`prd.md` FR-14, FR-29), not a multi-stage Python pipeline. We're replacing the separate service with an `AiPort` interface implemented in-process in NestJS, calling the model provider SDK directly. See `architecture.md` §3 for the interface shape and job flow.

## Consequences

- Deletes `backend/src/modules/ai/integrations/fastapi-skill-profile.client.ts` and the `AI_SERVICE_URL`/`AI_SERVICE_AUTH_TOKEN` env contract — this is real code to remove, not just a doc change (tracked in `architecture.md` §7, not fixed by this document).
- One fewer service to deploy, version, and keep in sync for a 6-person team on a fixed deadline.
- If a genuinely Python-only need surfaces later (e.g. a specific embedding/reranking library with no good TS equivalent), `AiPort` is the seam to add a second implementation behind — it doesn't have to be all-or-nothing again.
- `docs/ai-agent-rules.md`, `docs/local-development.md`, and `docs/ai-agents/m2-ai-engineer.md` still describe the old separate-service shape and need updating in lockstep with the actual code change (not part of this ADR).
