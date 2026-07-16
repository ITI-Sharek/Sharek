# Selected Repositories AI Skill Profiling Plan

## Decision

Build the contributor skill profiling flow as a backend-owned, queued evidence
pipeline:

```text
Contributor selects repositories in frontend
  -> NestJS validates ownership and snapshots selected GitHub evidence
  -> NestJS queues skill-profile generation
  -> FastAPI AI service analyzes compact evidence capsules
  -> NestJS validates the structured recommendation
  -> NestJS stores generated skills as pending
  -> Admin reviews, approves, rejects, or adjusts skills
  -> Approved skills become eligible for application validation
```

The frontend must never call the FastAPI AI service or a model provider
directly. The frontend calls Share-k backend APIs only.

## Why This Direction

This is the right MVP path because Share-k needs trust, explainability, and
fraud resistance more than instant self-declared skills. AI can propose skills,
but it must not directly approve them or qualify a contributor for work.

The selected-repository approach is also better than analyzing every visible
GitHub repository by default. It gives contributors control, reduces token and
GitHub API cost, and keeps the evidence set focused on repositories they want
Share-k to evaluate.

## Requirement Coverage

Primary backlog tasks:

- `TASK-1-05`: GitHub API ingestion service foundation.
- `TASK-2-04`: Admin APIs for pending AI-generated skills.
- `TASK-2-05`: RAG indexing for GitHub and project metadata.
- `TASK-3-02`: GitHub ingestion and skill profiling agent.
- `TASK-3-03`: Skill profile persistence backend integration.
- `TASK-3-04`: Contributor/admin skill profile frontend integration.
- `TASK-4-05`: AI-gated application workflow depends on approved skills only.
- `TASK-7-03`: AI observability and quality tracing.
- `TASK-8-03`: AI quality validation and demo data readiness.

Primary PRD requirements:

- `FR-012`: Generate initial skill profile from GitHub repositories.
- `FR-014`: Keep AI-generated skills pending until admin review.
- `FR-027`: Start GitHub ingestion after contributor connects GitHub.
- `FR-028`: Fetch repository, README, code, language, activity, commit, and
  technology evidence where available.
- `FR-029`: Generate structured skills with proficiency, confidence, and
  evidence source.
- `FR-030`: Persist generated skills in pending state.
- `FR-031`: Allow admins to approve, reject, or adjust generated skills.
- `FR-032`: Prevent pending/rejected skills from qualifying contributors.
- `FR-033`: Preserve source attribution for trust, review, and disputes.
- `FR-083` to `FR-094`: AI Trinity behavior, contracts, retrieval evidence,
  traceability, and failure handling.
- `NFR-001`: AI-generated skills must be admin-reviewable before eligibility.
- `NFR-002`: Prevent fraud, misuse, and reputation manipulation.

## Model Choice

The current cloud implementation uses Groq through `langchain-groq` with
`openai/gpt-oss-120b`. Model selection remains environment-configurable through
`LLM_PROVIDER` and `LLM_MODEL`; no provider key or model name is hardcoded in
business logic.

Model output does not determine trust by itself. Deterministic backend and AI
service checks establish repository membership, contributor-specific
authorship, exact evidence citations, confidence thresholds, and review state.
Changing the model therefore requires evaluation against the fraud fixtures but
does not bypass the same contract and policy.

Use `llama-3.1-8b-instant` only for low-cost smoke tests. Keep the stronger model
for profiling until a locked evaluation set shows that a smaller model meets
the attribution and faithfulness targets.

## Implementation Status

Implemented:

- authenticated paginated repository selection with cross-page frontend state.
- authenticated repository membership checks against GitHub `/user/repos`.
- contributor-specific commit/addition authorship evidence.
- partial evidence snapshots with safe failure codes.
- durable BullMQ jobs, retries, concurrency limits, and restart recovery.
- authenticated FastAPI contract with bounded request schemas.
- exact evidence-ID validation in FastAPI and NestJS.
- deterministic `needs_more_evidence` handling and pending-only candidates.
- canonical skill keys and superseding of repeated pending candidates.

Still separate backlog work, not claimed as complete here:

- admin approve/reject/adjust APIs and UI (`TASK-2-04`, `TASK-3-04`, `FR-031`).
- file-level authored-code, manifest, CI, and static-analysis evidence required
  for full `FR-028` depth.
- RAG indexing, AI observability, fraud evaluation fixtures, and production
  quality measurement (`TASK-2-05`, `TASK-7-03`, `TASK-8-03`).

## Analysis Depth

Use an evidence capsule strategy.

Every selected repository should produce a compact, structured evidence capsule.
The AI service should receive these capsules, not raw unbounded repository data.

Minimum evidence per selected repository:

- Repository identity: `fullName`, URL, visibility, default branch, owner login,
  fork/source metadata when available.
- Repository metadata: description, topics, primary language, language byte
  counts, stars, forks, watchers, open issues, pushed/updated timestamps.
- README summary: truncated or summarized content, extracted technologies,
  setup instructions, architecture hints, and claimed project purpose.
- Dependency manifests: `package.json`, lock files, `requirements.txt`,
  `pyproject.toml`, `Pipfile`, Docker files, CI files, and similar manifests
  where available.
- Authored commit signals: commit count, recent commit headlines, authored
  dates, changed files, and author identity match against the connected GitHub
  login where available.
- File-level code signals: changed file paths, frameworks, language constructs,
  and static summaries.
- Contribution activity: total contributors, commit stats, and unavailable
  reason if GitHub does not expose the data.

Language coverage:

- All languages get metadata, README, language-byte, dependency, commit, and
  activity evidence.
- JavaScript, TypeScript, and Python get stronger authored-code/static checks
  first because the current AI repo already has practical tooling for them.
- Other languages should still be analyzed from metadata and commits, but the
  backend should mark their evidence strength lower until code analyzers exist.

## Fraud And Weak-Evidence Policy

Do not auto-reject a contributor only because a repository looks suspicious.
Flag the generated skill profile for admin review with detailed signals.

Contributor-facing message:

```text
Some selected repositories did not provide enough strong evidence yet. Your
skills may need manual review or more contribution evidence before approval.
```

Admin-facing signals:

- Repository appears to be a fork or copied source with little authored delta.
- Connected GitHub login has few or no commits in the selected repository.
- Most commits are README-only, formatting-only, generated files, dependency
  lockfile churn, or trivial one-line edits.
- Repository was created recently, has no meaningful history, or has suspicious
  timestamp patterns.
- README claims technologies that are not supported by dependency files or code.
- Dependency manifests exist but user-authored code evidence is missing.
- Large codebase exists but commit authorship does not match the contributor.
- Repository is private and cannot expose enough evidence because of GitHub API
  limits or permission gaps.

Backend decision:

- Strong evidence plus high confidence: store pending skills with normal admin
  priority.
- Medium evidence or some weak signals: store pending skills with review notes.
- Weak evidence, suspicious authorship, malformed AI output, or low confidence:
  store generation as `needs_review` or failed/manual-review equivalent; do not
  approve skills and do not use them for eligibility.

## Backend Implementation Plan

Owning module for final state: `skill-profiles`.

Supporting modules:

- `github`: selected repository validation and normalized evidence snapshots.
- `ai`: FastAPI skill-profile contract and client adapter.
- `admin`: later review queues and moderation surfaces.

### Phase 1 - Backend Contract And Persistence

Add a contributor-facing generation API:

```text
POST /skill-profiles/me/generations
GET /skill-profiles/me/generations/:generationId
GET /skill-profiles/me
```

`POST /skill-profiles/me/generations` request:

```json
{
  "repositories": [
    { "fullName": "owner/repo" }
  ]
}
```

Validation:

- Authenticated user is a contributor.
- GitHub account is connected with repository evidence access.
- `repositories` is non-empty.
- Enforce MVP maximum, for example 10 selected repositories per generation.
- Every selected `fullName` is visible to the connected GitHub token.
- Deduplicate repository names.
- Reject malformed repository names.

Suggested response:

```json
{
  "generationId": "skill_generation_123",
  "status": "queued",
  "selectedRepositoryCount": 3,
  "message": "Skill profile generation started."
}
```

`GET /skill-profiles/me/generations/:generationId` response:

```json
{
  "generationId": "skill_generation_123",
  "status": "queued|collecting_evidence|analyzing|pending_review|needs_more_evidence|failed",
  "progress": {
    "selectedRepositoryCount": 3,
    "snapshottedRepositoryCount": 2
  },
  "failureReason": null,
  "skills": [
    {
      "id": "skill_profile_123",
      "name": "TypeScript",
      "proficiency": "intermediate",
      "confidence": 0.82,
      "status": "pending",
      "evidenceSummary": "..."
    }
  ]
}
```

Persistence:

- Add a durable generation table if no equivalent exists yet, for example
  `skill_profile_generations`.
- Store selected repository names, generation status, failure reason, provider,
  model, prompt version, schema version, service version, and timestamps.
- Store stable evidence snapshots or evidence source IDs. Do not depend only on
  live GitHub reads after generation.
- Store AI traces in the existing AI trace/audit mechanism where possible.
- Store generated skills in `skill_profiles` with `status = pending`.
- Preserve evidence source details in `evidence_sources` or a dedicated
  evidence table if the current JSON field becomes too coarse.

Status model:

```text
queued
collecting_evidence
analyzing
pending_review
needs_more_evidence
failed
```

The existing `SkillProfileStatus` should remain about individual skill review:

```text
pending
approved
rejected
disputed
```

### Phase 2 - GitHub Evidence Snapshot

Extend the GitHub public application service with a selected-repository method:

```text
getSelectedSkillProfilingEvidence(userId, fullNames)
```

It should reuse `getImportSnapshot(userId, fullName)` internally after
validating the repository is visible to the connected GitHub token. It must not
expose raw OAuth tokens to `skill-profiles` or `ai`.

Evidence collection should remain tolerant:

- Missing README should not fail the whole generation.
- GitHub pending stats should set `unavailableReason`.
- Rate-limit or permission failures should be recorded per repository.
- The generation can continue with partial evidence, but weak evidence must
  lower confidence and/or trigger manual review.

### Phase 3 - Queue And Worker

Use BullMQ/Redis for generation. This is slow external work and should not hold
an HTTP request open while fetching GitHub evidence and calling AI.

Recommended job:

```text
skill-profile-generation
```

Worker flow:

```text
load generation
  -> mark collecting_evidence
  -> fetch selected GitHub snapshots
  -> create compact evidence capsules
  -> mark analyzing
  -> call AiService skill-profile integration
  -> validate output schema
  -> apply backend confidence/evidence policy
  -> write pending SkillProfile records
  -> mark pending_review
  -> write AI trace/audit metadata
```

Failure flow:

- Timeout: retry if safe, then mark failed/manual-review.
- Malformed AI response: mark failed/manual-review and store safe failure
  reason.
- No citable evidence: do not create approved skills; store weak-evidence state.
- Partial repository failures: continue if enough evidence remains and surface
  missing evidence to admin.

### Phase 4 - AI Service And FastAPI Contract

Update the backend `AiService` skill-profile integration from evidence IDs only
to backend-provided evidence capsules.

Suggested input:

```ts
interface SkillProfileInput {
  contributorId: string;
  githubLogin: string;
  generationId: string;
  selectedRepositories: RepositoryEvidenceCapsule[];
  requestedAt: string;
}
```

Suggested output:

```ts
interface SkillProfileResult {
  skills: GeneratedSkillCandidate[];
  fraudSignals: FraudSignal[];
  evidenceQuality: "strong" | "medium" | "weak";
  recommendation: "pending_review" | "needs_more_evidence";
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  serviceVersion: string;
}
```

Each generated skill must include:

- skill name
- proficiency: `beginner`, `intermediate`, or `advanced`
- confidence
- evidence IDs or evidence paths
- short evidence summary
- limitations or weak-evidence notes

Backend must validate:

- confidence is numeric and within range.
- every skill cites at least one evidence source.
- skill names are normalized/deduplicated.
- model/provider/schema metadata is present.
- output cannot directly set `approved`.

### Phase 5 - Admin Review

Admin should receive a reviewable set of pending skills:

```text
GET /admin/skill-profiles/pending
POST /admin/skill-profiles/:id/approve
POST /admin/skill-profiles/:id/reject
PATCH /admin/skill-profiles/:id
```

Admin UI should show:

- skill name, proposed proficiency, confidence, status.
- evidence summary and source links.
- selected repositories used for the generation.
- fraud/weak-evidence signals.
- AI trace metadata: provider, model, prompt version, schema version, service
  version, created timestamp.
- action history.

Only approved skills can be used by application eligibility.

### Phase 6 - Frontend Integration

Frontend repository picker:

- Use the existing paginated `GET /github/repositories?page=&perPage=` endpoint.
- Allow multi-select.
- Show repository visibility, language, last updated, and selected count.
- Limit the number of selected repositories to the backend maximum.
- Submit selected repositories to `POST /skill-profiles/me/generations`.

Frontend progress view:

- Poll `GET /skill-profiles/me/generations/:generationId`.
- Show queued, collecting evidence, analyzing, pending review, and failed
  states.
- Do not promise instant approval. Generated skills are pending until admin
  review.
- For weak evidence, show the neutral contributor-facing message.

Contributor profile view:

- Show pending generated skills to the profile owner.
- Show approved skills to other viewers.
- Keep rejected/disputed details private unless a later product decision says
  otherwise.

## AI Repository Implementation Plan

Change the AI skill profiling endpoint so it accepts backend-selected evidence
instead of fetching all public repositories by GitHub username.

Recommended FastAPI endpoint:

```text
POST /skill-profiles/generate
```

Request should include:

- contributor ID and GitHub login.
- generation ID.
- selected repository evidence capsules.
- schema version.

The AI repo should:

- keep prompts evidence-first.
- never invent skills without cited evidence.
- distinguish project ownership, authorship, and weak participation.
- use static authored-code checks for JavaScript, TypeScript, and Python first.
- return fraud/weak-evidence signals separately from skills.
- return strict structured JSON matching the backend schema.
- include provider/model/prompt/schema/service metadata.

The AI repo should stop doing this for the Share-k backend flow:

```text
input username -> fetch all public repos itself -> infer skills
```

That flow can remain as a local/dev tool, but production Share-k should use:

```text
backend-selected evidence -> AI interpretation -> backend validation/storage
```

## Test Plan

Backend tests:

- request validation: empty selection, malformed `fullName`, too many repos.
- authorization: only authenticated contributors can start generation.
- GitHub ownership/visibility: selected repos must be visible to connected
  token.
- queue enqueue: generation status becomes `queued`.
- worker happy path: snapshots evidence, calls `AiService`, stores pending skills.
- worker partial evidence: missing README/stats does not fail everything.
- malformed AI output: generation fails or routes to manual review.
- weak evidence: no approved skills are created automatically.
- duplicate skill output: backend merges or rejects duplicates predictably.
- approved-only eligibility: pending/rejected/disputed skills cannot qualify a
  contributor.

AI repo tests:

- selected-evidence request schema validation.
- no-evidence and weak-evidence outputs.
- cloned/forked repo fixtures.
- README-only project fixture.
- dependency-only project fixture.
- authored JS/TS/Python project fixture.
- mixed-language metadata-only fixture.
- strict JSON schema conformance.

Frontend tests:

- paginated repository picker supports multi-select.
- selected count and maximum selection errors.
- submit starts generation.
- progress states render correctly.
- pending skills are visible to owner only.
- weak-evidence message is neutral and does not expose admin fraud details.

## Fraud Testing Fixtures

Create deterministic fixtures before tuning prompts:

- Real-authored small project with meaningful commits.
- Forked repository with no authored commits.
- Cloned repository with renamed README and minimal edit.
- Repository with only README changes.
- Repository with dependency files but no authored source.
- Repository with generated code and little human-authored logic.
- Repository where user contributed only docs.
- Repository with meaningful contribution in a large team project.

Success criteria:

- Real-authored projects produce reasonable pending skills with evidence.
- Forked/cloned/simple-change projects are flagged for review.
- README-only evidence does not produce high-confidence advanced skills.
- Pending skills never qualify contributors until admin approval.

## Rollout Order

1. Backend docs/contracts and schema design.
2. Backend generation table, repository selection endpoint, and queue skeleton.
3. GitHub selected evidence snapshot method.
4. `AiService` integration update and FastAPI client.
5. Worker implementation with mocked AI tests.
6. AI repo endpoint update for selected evidence capsules.
7. Frontend multi-select and progress UI.
8. Admin pending-skill review UI/API.
9. Evaluation fixtures and fraud-signal tuning.
10. End-to-end demo script.

## Implementation Handoff Prompt

Use this prompt with the implementation model:

```text
You are implementing Share-k selected-repository AI skill profiling.

Use the configured Groq model for runtime profiling and keep model choice behind
`LLM_PROVIDER` and `LLM_MODEL`. Do not let a model change bypass deterministic
authorship, citation, confidence, or review policy.

Read AGENTS.md and the required backend docs first. Keep final state ownership
inside skill-profiles. Use github only through public application services for
selected repository evidence. Use AI only through `AiService` and clients to the FastAPI
AI service. Do not let AI output directly approve skills or qualify
contributors.

Implement in this order:
1. Backend contract and persistence for skill profile generations.
2. Selected GitHub evidence snapshot method.
3. BullMQ worker to collect evidence and call SkillProfileGenerator.
4. Strict AI response validation and pending SkillProfile persistence.
5. API docs, module README updates, tests, and tracker entry.
6. Then update the FastAPI AI repo endpoint to accept selected evidence
   capsules.
7. Then update the frontend repository picker to multi-select and show
   generation progress.

Run npm run check:architecture, focused tests, lint/build where code changes,
and git diff --check before handoff.
```

## Open Risks

- GitHub can fail to attribute commits when contributor email/login metadata is
  unavailable; these cases intentionally become `needs_more_evidence` instead
  of receiving optimistic confidence.
- The MVP stores compact JSON evidence snapshots. High-volume review/search may
  later need normalized evidence tables.
- Admin review and file-level authored-code analysis remain required before the
  complete product trust workflow can launch.
- Groq model availability can change; validate configured model IDs during
  deployment and keep the evaluation set provider-independent.
