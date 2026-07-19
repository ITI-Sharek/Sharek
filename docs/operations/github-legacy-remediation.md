# GitHub legacy broad-token and private snapshot remediation (SEC-003)

**Scope:** issue S1-06. Historical GitHub connections were created with the broad
`repo` OAuth scope (or before scope tracking existed), and skill-profile
generations stored raw evidence snapshots collected through those tokens. This
runbook remediates that exposure without logging tokens or private repository
content anywhere.

## What the code enforces without operator action

- New GitHub OAuth connections never request the broad `repo` scope; the granted
  scope is recorded on `GitHubAccount.token_scope`.
- `GitHubAccountService.getAccessToken` refuses accounts whose scope is broad or
  unrecorded (`GITHUB_REAUTHORIZATION_REQUIRED`, 403), so no evidence collection
  or generation can use a legacy token even before the cleanup job runs.
- Reauthorizing (completing the OAuth/GitHub App connection again) records the
  fresh narrow scope and clears `requires_reauthorization` and the purge marker;
  evidence is then recollected only for explicitly selected repositories.

## Cleanup job

Run from `backend/` with the target environment's variables set. Both modes are
idempotent — rerunning after a partial failure only touches what is left.

```bash
pnpm remediate:github-legacy           # phase 1: flag + quarantine (non-destructive)
pnpm remediate:github-legacy --purge   # phase 2: delete snapshots + legacy tokens
```

Phase 1 (`remediate`):

1. `flag_legacy_accounts` — accounts whose `token_scope` is null or contains the
   standalone `repo` grant get `requires_reauthorization = true` and a
   timestamp. Connected users see the reauthorization-required state.
2. `quarantine_evidence_snapshots` — every non-null `evidence_snapshot` owned by
   a flagged account gets `evidence_quarantined_at`, excluding it from AI and
   public projections immediately.
3. `purge_expired_audits` — audit rows older than 90 days are deleted.

Phase 2 (`--purge`) — **must run no later than 7 days after phase 1**:

1. `purge_quarantined_snapshots` — quarantined raw snapshots are set to database
   null and stamped `evidence_purged_at`.
2. `purge_legacy_tokens` — flagged accounts' encrypted access/refresh tokens are
   cleared and stamped `legacy_token_purged_at`.
3. `purge_expired_audits` — as above.

## Audit and privacy guarantees

- The `GitHubRemediationAudit` table stores only: optional internal account ID,
  step action, result (`success`/`failed`), affected row count, and timestamps.
  It is deleted after 90 days by the job itself.
- Step failures are recorded as `failed` with a count of 0 and **no error
  detail** — errors could wrap responses naming private repositories or
  credentials. Log output contains step name, result, and count only.

## Roll-forward and recovery

- No applied migration is edited; the schema change
  (`20260719120000_github_legacy_remediation`) is additive and forward-only.
- Between phase 1 and phase 2 a quarantined snapshot can be restored only by
  clearing its `evidence_quarantined_at` — do this solely if an account is
  proven to have held a narrow grant that was mislabeled. After phase 2 the raw
  snapshot is gone by design; recovery is reauthorization plus fresh collection
  from explicitly selected repositories.
- If a step fails, fix the cause and rerun the same command; audits make each
  run's effect visible without exposing content.
