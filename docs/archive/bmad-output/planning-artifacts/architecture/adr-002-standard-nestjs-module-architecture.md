# ADR-002: Standard NestJS Module Architecture

Status: accepted

Date: 2026-07-16

Supersedes: ADR-001 implementation guidance about use cases, ports, adapters,
and domain/application/infrastructure/presentation layers. ADR-001's platform
choices remain valid unless this ADR changes them.

## Context

The previous layered structure imposed vocabulary and navigation cost that the
team did not understand consistently. Simple workflows were spread across many
files, abstract ports often had one implementation, and contributors had to
learn architecture ceremony before changing ordinary NestJS behavior.

Share-k still needs firm module ownership, thin controllers, authorization,
auditable AI decisions, and isolated external integrations. Those properties do
not require Clean Architecture folders.

## Decision

Use a feature-first NestJS modular monolith with standard controllers, services,
DTOs, and Prisma.

```text
Controller -> DTO validation -> Service -> Prisma
                                    -> exported module service
                                    -> integration client
```

Small modules keep controller and service files at module root. Larger modules
may group multiple controllers and services. Optional technical folders are
created only when needed: `integrations/`, `repositories/`, `jobs/`, `events/`,
`security/`, `mappers/`, `validators/`, and `utils/`.

Cross-module behavior is called through services exported by the owning NestJS
module. A module must not import another module's private technical files or
write another module's database tables.

AI clients return structured recommendations. The owning backend service applies
deterministic checks, makes the final business decision, and persists an audit
snapshot.

## Consequences

- `application/`, `domain/`, `infrastructure/`, and `presentation/` folders are removed.
- Use-case classes, reader ports, and one-implementation abstract repositories are removed.
- Business rules live in focused services or validators close to the module.
- Complex Prisma query collections may use a concrete repository for readability.
- BullMQ workers and queues remain under `jobs/` where asynchronous processing exists.
- Existing routes, response contracts, authorization, Prisma models, and migrations
  must remain stable during the migration.
- `npm run check:architecture` enforces the simplified boundaries.

## Revisit When

- A measured module complexity problem cannot be handled by focused services.
- A capability is extracted into a separately deployed service.
- Multiple persistence implementations become a real requirement.
