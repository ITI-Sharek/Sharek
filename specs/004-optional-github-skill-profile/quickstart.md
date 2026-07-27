# Quickstart: Validate Optional GitHub Skill Profiling

## Before implementation

1. Read `spec.md`, `plan.md`, `research.md`, `data-model.md`, and both files in
   `contracts/`.
2. Confirm registration without GitHub and the current OAuth repository flow in
   existing tests.
3. Register a development GitHub App only after the planned callback and webhook
   routes have local/public URLs available.

## Development GitHub App settings

Use a separate development app. Configure:

- Homepage URL: the development frontend URL.
- Callback URL: the public backend GitHub App callback.
- Request user authorization during installation: enabled.
- Setup URL: blank; this flow completes through the OAuth callback.
- Webhook URL: the public backend GitHub App webhook route.
- Webhook secret: a newly generated secret.
- Repository permissions: Metadata read-only, Contents read-only.
- Repository selection during install: selected repositories only.
- App visibility: private for single-owner development; public before testing
  installations by unrelated accounts.

Generate a private key after the app exists. Store it outside the repository and
load it through ignored local configuration. Do not paste it into issues, docs,
chat, logs, or tracked environment files.

## Validation fixtures

Prepare:

- one Share-k contributor with email/password login and no GitHub;
- one passwordless GitHub-sign-in user;
- one personal GitHub installation with a selected public repository;
- one selected private repository;
- one accessible but unselected private repository;
- optionally one organization installation requiring owner approval.
- two Share-k contributors who are members of the same test organization.

## End-to-end scenarios

1. Register and verify without GitHub; confirm normal profile and discovery work.
2. Start installation from profile; cancel; confirm profile remains usable.
3. Start from Share-k's state-bearing installation URL, install on one selected
   repository, and complete the verified OAuth callback.
4. Confirm the picker contains selected repositories and excludes the unselected
   private repository.
5. Link the same organization installation from the second contributor through a
   separately state-bound GitHub App web authorization; confirm both user links
   have independent encrypted/expiring member authorization and no consent,
   generation, or skill state is copied between users.
6. Disconnect the first contributor's organization link; confirm the second
   contributor's link and canonical installation remain active.
7. Confirm installation alone creates no generation.
8. Start generation without consent; expect a validation error.
9. Start with consent and selected immutable repository IDs; poll to a durable
   initial status within three seconds, then to a terminal status and inspect
   evidence attribution.
10. Retry a failed or `needs_more_evidence` generation; confirm the previous
   selection is prefilled, consent is reconfirmed, current access is revalidated,
   and a new generation ID is returned without reconnecting the installation.
11. Remove a repository in GitHub; deliver/process the webhook; confirm within a
   controlled five-minute window that a new
   generation cannot read it.
12. Suspend/uninstall the app; confirm later private reads fail closed for every
    linked Share-k user.
13. Confirm pending skills do not qualify applications and admin review still
    controls approval.
14. Disconnect one local installation for the passwordless user; confirm GitHub
    login identity and other installations remain, reads through the disconnected
    link stop, and GitHub uninstall remains a separate settings action.
15. Inspect owner-generation, bounded-admin-review, authorized-skill-AI,
    other-user/public profile, project, discovery/retrieval, log, and unrelated-AI
    fixtures; confirm private identifiers/details appear only at the three
    authorized boundaries and never in public/unrelated output.

## Pre-release usability validation

Recruit at least ten representative contributors who did not implement the
feature. Without facilitator intervention, ask each to install the app, select a
repository, confirm consent, and start analysis. Record first-attempt completion;
at least nine of ten must succeed before release.

Release evidence status (2026-07-27): protocol prepared; participants `0/10`,
first-attempt completions `0/10`, result `PENDING EXTERNAL VALIDATION`. This is
intentionally not reported as a pass by automated implementation work.

## Legacy evidence migration validation

- One durable database cutover timestamp starts the 30-day evidence window.
- At cutover, new analysis stops using broad OAuth, provider grants are revoked
  where supported, and stored broad repository credentials are purged.
- Before day 30, audit approved, pending, and rejected legacy-derived skills.
- At day 30, verify non-reusable raw private evidence is redacted/purged, broad
  credentials remain absent, approved skills/admin decisions/minimal safe
  attribution remain, and unresolved candidates become `needs_more_evidence`.
- Run the cleanup with a controlled clock immediately before, at, and after the
  30-day boundary; rerun it to prove idempotency and verify unknown/private JSON
  keys are removed according to the field inventory in `research.md`.

## Quality gates

```bash
npm run check:architecture
npm run lint
npx tsc --noEmit
npx prisma validate
npm test -- --runInBand
npm run build
git diff --check
```

Apply and inspect migrations against representative brownfield data before any
legacy OAuth credential cleanup. Real provider testing requires a public HTTPS
callback/webhook endpoint and secrets supplied outside version control.

Local execution record (2026-07-27): both Feature 1 migrations were applied to
the running Docker PostgreSQL service with `prisma migrate deploy`; subsequent
`prisma migrate status` reported all 16 migrations applied and the schema up to
date. This is local integration evidence, not staging/production cutover or the
SC-004 external usability result.
