# ShareK Engineering Guide

**Status:** Supporting operational guidance
**Canonical architecture:** `../architecture.md`

## 1. Read before implementation

1. `../README.md`
2. `../product-spec.md`
3. `../architecture.md`
4. `../api-contracts.md`
5. `../delivery-plan.md`
6. Relevant ADR and module README
7. `../audits/codebase-gap-report.md` for current repository evidence

Check `git status` and inspect current code. Never infer completion from an old
plan, directory name, or module file.

## 2. Backend structure

ShareK uses a feature-first NestJS modular monolith. Standard small module:

```text
feature/
  feature.module.ts
  feature.controller.ts
  feature.service.ts
  feature.service.spec.ts
  dto/
  README.md
```

Larger modules may use `controllers/`, `services/`, `integrations/`, `jobs/`,
`events/`, `mappers/`, `repositories/`, `security/`, `validators/`, and `utils/`
when real files justify them. Do not create empty architectural placeholders.

Use `module-skeleton.md` as the copyable example.

## 3. Responsibilities

- Controllers bind/validate HTTP input, call a service, and map output.
- Services own authorization, deterministic validation, workflow, and final
  business decisions.
- DTOs define stable request/response contracts; never expose raw Prisma rows.
- Prisma access lives in the owning module’s service/repository boundary.
- Integration clients isolate GitHub, FastAPI, email, and storage protocols.
- Jobs are idempotent, retry-bounded, observable, and safe to replay.
- Events describe completed facts and do not command another module’s internals.

Avoid one-implementation ports, use-case classes, abstract repositories, or
layer folders that add indirection without a real second implementation.

## 4. Module ownership

Follow the ownership table in `../architecture.md` §4. A module:

- writes only its own tables;
- exports services as its public boundary;
- never imports another module’s private repository, client, security class,
  controller, job, mapper, validator, or utility; and
- keeps technical cross-cutting code, not domain workflows, in `shared/`.

## 5. AI-backed work

```text
owning NestJS service
  -> deterministic validation
  -> NestJS AI facade
  -> bounded FastAPI client
  -> validate structured advice
  -> owning service persists audit/output
  -> human/business workflow makes final decision
```

AI never directly mutates acceptance, evidence approval, moderation, review
publication, or reputation. Persist evidence references, confidence,
uncertainty, prompt/model versions, timeout/fallback state, and dispute history.

## 6. API and persistence changes

- Start from `../api-contracts.md`; label current and target behavior clearly.
- Validate every input and use a stable error envelope.
- Review object-level authorization, not just route authentication.
- Add migrations rather than editing applied migrations.
- Make constraints enforce domain invariants where possible.
- Include rollback/forward-recovery reasoning for destructive schema changes.
- Update API examples and relevant module README.

## 7. Implementation workflow

1. Identify the delivery slice, requirements, and approved decisions.
2. Confirm owning context/module and current gap evidence.
3. Define authorization, state transition, API, and persistence impact.
4. Implement the smallest end-to-end workflow.
5. Add focused unit/integration/contract tests.
6. Run relevant static, architecture, Prisma, test, and build checks.
7. Update the module README and `../audits/codebase-gap-report.md` with verified
   current facts.
8. Report changed contracts, migrations, risks, and open decisions.

Do not copy planned work into the gap report. Link to `../delivery-plan.md`.

## 8. Required checks

From `backend/` as applicable:

```bash
npm run check:architecture
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run build
npx prisma validate
```

The architecture checker currently contains obsolete documentation paths; that
known tooling issue is recorded in the codebase gap report. Report it precisely
instead of weakening architectural checks or changing application code during a
documentation task.

Frontend work must establish a real test command and run its type/build/test
checks before any feature is marked tested.

## 9. Documentation ownership

- Product behavior: `../product-spec.md`
- Domain and technology: `../architecture.md`
- HTTP contracts: `../api-contracts.md`
- Planned slices: `../delivery-plan.md`
- Current implementation evidence: `../audits/codebase-gap-report.md`
- Verification: `../test-strategy.md`
- Narrow rationale: `../adr/`

Do not create a second PRD, domain model, backlog, sprint authority, or module
delivery tracker.
