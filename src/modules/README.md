# Backend Modules

Business code is organized by feature, not by global technical layer.

Each module owns its own business capability and database tables. Use
`domain/`, `application/`, `infrastructure/`, and `presentation/` when they add
real value. Do not fill these folders with empty classes just to satisfy the
architecture.

The leaf folders are intentionally present as a ready skeleton for the team and
AI coding agents. Keep `.gitkeep` files until real files are added.

For a copyable example, see `docs/examples/module-skeleton.md`.
