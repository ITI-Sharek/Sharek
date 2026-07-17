# Prisma 6 as the ORM

**Status:** Accepted — ratifies `docs/archive/bmad-output/planning-artifacts/architecture/adr-001-backend-architecture.md`'s ORM choice, unchanged

`adr-001` chose Prisma over TypeORM/Drizzle; the v2 Master Brief later re-opened this as `TBD`. It shouldn't have been reopened — the codebase already runs on Prisma 6 (`@prisma/client ^6.1.0`, 11 real migrations under `backend/prisma/migrations/`). Re-litigating an ORM this deep into a fixed-deadline build would cost a migration for no product benefit. Closing it again, explicitly.

## Consequences

None beyond the obvious — this ADR exists mainly to stop the ORM question from resurfacing a third time in a future planning document.
