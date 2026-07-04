# Shared Backend Infrastructure

`shared/` contains technical capabilities used by multiple modules.

Allowed examples:

- database setup
- auth request plumbing
- shared error handling
- event transport
- observability
- configuration validation

Do not place module-specific business rules, repositories, DTOs, prompts, or
helper functions here for convenience.

