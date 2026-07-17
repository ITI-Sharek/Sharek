# Prisma 6 as the ORM

**Status:** IMPLEMENTED

The codebase runs on Prisma 6 (`@prisma/client ^6.1.0`) with ten migration
directories under `backend/prisma/migrations/`. Replacing the ORM during the MVP
would add migration risk without product value.

## Consequences

- Prisma owns schema and migrations.
- Use additive, reviewed migrations; do not edit applied migrations.
- Revisit only for a demonstrated technical constraint.
