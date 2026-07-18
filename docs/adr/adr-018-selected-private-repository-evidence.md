# Selected private-repository evidence with narrow read-only consent

**Status:** APPROVED through SEC-003

An authenticated linked-GitHub user may explicitly select public or private
repositories for evidence analysis. Access is read-only, revocable, recorded,
and limited to the selected repositories.

## Consequences

- The current broad `repo` OAuth scope remains an implementation/security gap.
- Private source, diffs, names, URLs, and citations never appear publicly.
- Derived public claims require contributor visibility consent and disclose that
  the underlying evidence is private and not publicly inspectable.
- Disconnect/revocation stops future access and starts the approved
  retention/deletion/reindex flow.
- Repository code and repository-provided configuration are never executed.
