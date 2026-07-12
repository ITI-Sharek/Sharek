# Contribution Tasks Module

Owns contribution opportunities created under published projects.

Contribution tasks answers these questions:

- What work can contributors apply for?
- Which skills are required?
- Is the task open, closed, full, or expired?
- What owner limits apply to creating or opening tasks?

Current state:

- The module is registered but task workflows are not implemented yet.
- Add folders only when a sprint task creates real files.

Use this module for:

- Creating contribution tasks.
- Required skills and difficulty.
- Deadlines, capacity, and optional rewards.
- Opening and closing tasks.
- Owner monthly task limits when subscription work begins.

Applications target open tasks. Task requirement changes must not silently alter
already decided applications.

## Where To Put New Files

- `presentation/http/controllers`: create, update, open, close, list, and task
  detail endpoints.
- `presentation/http/requests`: create/update task request DTOs, search filters,
  status change requests.
- `presentation/http/responses`: task list and task detail response shapes.
- `application/use-cases`: create task, update requirements, open/close task,
  list project tasks, list discoverable tasks.
- `application/ports`: project reader, owner subscription/limit reader, or
  application count reader when needed.
- `domain/entities`: contribution task entity and lifecycle transitions.
- `domain/policies`: task capacity, deadline, owner limit, required skill, and
  edit policy.
- `infrastructure/persistence`: Prisma task repository and persistence mapper.

## Boundaries

Tasks belong to projects, but task status and requirements belong here.

Applications read task requirements but own application status. Changing task
requirements must not rewrite already completed AI decisions without an
explicit revalidation workflow.
