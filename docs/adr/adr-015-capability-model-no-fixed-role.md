# Capability model: no fixed `User.role`, roles derived per project

**Status:** APPROVED through SEC-002

`OWNER`, `CONTRIBUTOR`, and `APPLICANT` are contextual capabilities. Owner derives from project ownership/verified maintainer authority, contributor from an active assignment, and applicant only from an active application in the relevant task/project. `ADMIN` remains the account-level privileged role.

The current Prisma schema still requires `owner | contributor | admin` and registration persists it. That is an implementation gap, not target authority.

## Consequences

- Requires an actual schema/API migration; this documentation change does not implement it.
- No `ProjectMember` table is introduced to replace it — the derivation is cheap enough at MVP scale to compute on read, and adding a writable membership table now would be solving a performance problem that doesn't exist yet.
- Every product-role read must move to scoped derivation across identity, projects, applications, profiles, and frontend guards.
