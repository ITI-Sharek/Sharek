# Documentation Consolidation Migration History

**Status:** Point-in-time audit
**Date:** 2026-07-17
**Normative authority:** None

This file records documentation lineage. It does not introduce or approve
requirements. The current canonical sources are listed in `../README.md`.

## Consolidation outcome

- Reduced the canonical set to seven documents.
- Merged product brief, PRD, and frontend behavior into `../product-spec.md`.
- Merged the former data-model document into the domain sections of
  `../architecture.md`.
- Consolidated epics, seed planning, and delivery gates into
  `../delivery-plan.md`.
- Consolidated engineering and onboarding guides under `../operations/`.
- Replaced the deleted module tracker’s current-state function with
  `codebase-gap-report.md`; no second delivery plan was created.
- Moved active agent/skill instructions under `../tooling/`.
- Moved research and external constraints under `../reference/`.
- Retained superseded sources under `../archive/` before removal from active
  paths.

## Authority correction

Earlier generated documents described themselves as approved. Detail and
generation provenance do not create authority. Binding decisions come from
`../decision-log.md`; consolidated canonical documents remain `PROPOSED` until
humans approve them.

## Principal contradiction resolutions

| Topic | Superseded material | Surviving direction |
|---|---|---|
| Core backend | Competing in-process-only or separate-backend models | NestJS business core, bounded FastAPI analysis service |
| AI Skill Inference | Deferred/cut in generated scope | Required MVP, evidence-backed and disputable |
| Application AI | Strict eligibility gate | Required advisory fit; every valid application reaches owner |
| External projects | Links-only or identity-like verification | Auditable admin review, distinct evidence/verification tier |
| Profile trust | One verified state | Multiple source-explained signals |
| Repository ownership | Staff-selected arbitrary repositories | Verified maintainer permission; repository-free projects supported |
| Assignment | Inconsistent multi-contributor capacity | One primary accepted contributor per task in MVP |
| Applicant access | Any historical application | Active, scoped statuses only |
| Skill evidence | One mutually exclusive state | Evidence source and human review are independent |
| Blind review | Wait until expiry | Publish when both submit or at expiry |
| Payments/hiring | Premium and company/team scope | Outside MVP |

## Source relocation

- Superseded Claude-generated product/planning documents →
  `../archive/claude-grill/`.
- Unused generated tooling and outputs → `../archive/legacy/`.
- Legacy PDFs/DOCX and product briefs → `../archive/legacy/`.
- ITI checklist → `../reference/iti-ai-capstone-checklist.pdf`.
- Strategic questions → `../reference/sharek-strategic-questions.txt`.
- Engineering guides → `../operations/` or legacy archive after merge.
- Agent/skill instructions → `../tooling/`.

## Known post-consolidation tooling mismatch

The JavaScript architecture checker was outside the approved documentation-only
write scope. It still requires former documentation paths. This does not change
application behavior, but its documentation-path checks require a separately
authorized tooling update. See `codebase-gap-report.md`.

## Historical interpretation

Files under `archive/` may retain old paths, terminology, and contradictory
decisions because they are preserved evidence. They must not be linked as active
implementation instructions. Point-in-time audits may also name paths that
existed when the audit was written.
