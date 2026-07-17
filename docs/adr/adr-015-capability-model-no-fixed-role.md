# Capability model: no fixed `User.role`, roles derived per project

**Status:** Accepted

`OWNER`, `CONTRIBUTOR`, and `APPLICANT` are derived per project at query time — from `Project.ownerId`, from an `Application` reaching `ACCEPTED`, from an `Application` existing at all, respectively (`data-model-and-erd.md` §1) — never stored as a fixed field on the account. `ADMIN` remains the one real account-level flag. The same person owns one project and contributes to another on a single account, which the product always intended (`product-brief.md` §2 frames the owner and contributor as the same population wearing different hats, not two account types) but which a fixed role enum structurally forecloses.

This was surfaced, not invented, during this session: `prisma/schema.prisma`'s `User.role` is a required `owner | contributor | admin` enum, set directly from the registration payload — real, tested behavior (`auth.service.spec.ts`), and a frontend spec from a separate session (`/spec.md`) independently flagged the same defect pattern in its own `AuthUserDto.role`. Both sides of the stack converged on the same wrong model independently, which is exactly the kind of thing worth writing down so it doesn't happen a third time.

## Consequences

- Requires an actual schema migration (drop `User.role`, decide the derivation queries or a lightweight materialized view if the contributor-list screen's performance ever needs one) — real work, not fixed by this document, tracked as E1-04 in `epics-and-stories.md`.
- No `ProjectMember` table is introduced to replace it — the derivation is cheap enough at MVP scale to compute on read, and adding a writable membership table now would be solving a performance problem that doesn't exist yet.
- Every place `role` was read (permission checks, profile display, the registration payload itself) needs to move to project-scoped derivation — this touches `identity`, `projects`, and the frontend's route guards together, not just one module in isolation.
