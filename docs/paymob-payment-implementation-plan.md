# Paymob Payment Implementation Plan

Date: 2026-08-18
Branch: `feat/paymob-callback-activation`
Baseline: `origin/main` at `1249df6`
Primary tickets: PAY-01 / #102, PAY-02 / #103, PAY-03 / #105, PAY-04 / #106
Canonical product plan: `ITI-Sharek/Documentation/plans/paymob-payment-handoff.md`

Frontend companion: `../../paymob-frontend/docs/paymob-payment-frontend-plan.md`
implements PAY-05 on `feat/paymob-checkout-activation`; PAY-06 remains the
external sandbox evidence gate described below.

## Executive decision

The backend implementation is complete on this isolated branch. It is ready
for code review and deterministic local verification; a real Paymob sandbox
checkout remains an operational release gate until the public HTTPS URLs and
enabled sandbox configuration are supplied.

- PAY-01, PAY-02, and PAY-03 are already merged into `origin/main`. Their open
  GitHub states and `blocked` labels are stale administrative state, not missing
  backend code.
- PAY-04 is implemented here: receive a Paymob transaction callback, verify it,
  match it to a stored attempt, and activate the purchased role-context plan
  exactly once.
- The implementation and automated tests do not require real secrets.
- A live Paymob sandbox exercise remains blocked by PAY-00 operations work:
  securely supplying sandbox keys, exposing public HTTPS callback/result URLs,
  and configuring those URLs in the Paymob dashboard.
- PAY-01/PAY-03 compatibility hardening is included: the Intention request now
  carries customer/billing and callback fields, checkout returns a complete
  Unified Checkout URL, and callbacks expose the Share-k reference needed to
  locate a `PaymentAttempt`.

This branch must remain disabled by default and is approved only for the
isolated capstone sandbox. It is not approval for shared demo, staging, or
production checkout.

## Readiness by ticket

| Ticket | Code state on `origin/main` | Ready? | Required action |
|---|---|---:|---|
| PAY-01 / #102 | Provider module, feature flag, Intention adapter, HMAC verification, and tests exist. | Yes | Intention and callback mapping are hardened to the current provider contract, with bounded validation and no secret logging. |
| PAY-02 / #103 | Free/Gold catalog, `PaymentAttempt`, `PaymentWebhookEvent`, state helper, and migrations exist. | Yes | Callback invariants add one pending purchase per role/provider and unique non-null provider order/transaction binding. |
| PAY-03 / #105 | Catalog, idempotent checkout, and payer-scoped status routes exist and are tested. | Yes | Checkout now supplies the allowlisted customer profile and returns the backend-built Unified Checkout URL. |
| PAY-04 / #106 | Public callback, exact fact matching, atomic transition, and subscription activation are implemented here. | Yes for code review | Run the local gates below; live provider evidence remains PAY-06/PAY-00 operational work. |
| PAY-05 / Frontend #37 | Separate frontend work. | Not part of this branch | Consume `checkoutUrl`, add the result route, and poll backend status. Redirect data remains UX-only. |
| PAY-06 / #104 | Live sandbox/release evidence. | Blocked | Requires PAY-00 credentials and public URLs plus PAY-04 and PAY-05 completion. |

## Confirmed product contract

- `free` is the absence of a paid subscription and has no checkout.
- `gold` costs `50,000` minor units (`500 EGP`) for one role context.
- Both owner and contributor role contexts may purchase Gold.
- A purchase grants 30 calendar days starting from the first verified successful
  callback. It does not auto-renew.
- A user cannot buy Gold again while Gold is active for the same role context.
- Browser redirect/query data never changes payment or subscription state.
- A verified backend transaction callback is the payment authority.
- Payments owns provider calls, attempts, and webhook receipts. Subscriptions
  owns `Subscription` rows and must expose the command used for activation.
- Refund automation, recurring billing, invoices, escrow, task payments,
  contributor payouts, and production release are out of scope.

## Provider contract verified for this plan

The current Paymob material requires the Intention API and Unified Checkout:

- Create the Intention from the backend with `Authorization: Token <secret>`.
- Send amount in the smallest currency unit, allowed integration IDs, a unique
  `special_reference`, customer/billing data, `notification_url`, and
  `redirection_url`.
- Paymob echoes `special_reference` as `order.merchant_order_id` in the
  transaction callback.
- Build Unified Checkout with the public key and returned client secret.
- Verify the POST transaction callback with HMAC-SHA512 over the documented 20
  fields in their exact order. The HMAC is a callback query parameter.
- Deduplicate on the Paymob transaction ID and perform the business transition
  atomically. The browser redirect is never authoritative.

Primary references to re-check immediately before provider-facing coding:

- [Paymob API integration path](https://developers.paymob.com/paymob-docs/integration-paths/apis)
- [Paymob callbacks and HMAC](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac)
- [Official Paymob integration reference](https://github.com/PaymobAccept/Paymob-AI-Integration-Skill/blob/main/universal-prompt.md)
- [Official Unified Checkout frontend reference](https://github.com/PaymobAccept/Paymob-AI-Integration-Skill/blob/main/skills/paymob-integration/references/code-frontend.md)

## Implementation status on this branch

The planned work is implemented in the `paymob-callback-activation` worktree:

- checkout reads an identity-owned, allowlisted customer profile, validates an
  E.164 phone, sends item/billing/customer/callback data to Paymob, and returns
  a backend-built `checkoutUrl`;
- Prisma now stores the checkout URL and enforces one pending purchase per
  user/role/provider plus unique non-null provider order and transaction IDs;
- `POST /payments/paymob/webhook` is public and thin; the service verifies the
  signed callback, records a minimized event, matches all stored facts, locks
  the attempt, transitions it once, and handles duplicate/declined/pending/
  mismatched callbacks without activating entitlement;
- a transaction-aware subscriptions command retires the prior active row and
  creates one 30-day Gold `payment_provider` row after the first verified
  success; and
- generated Postman inventory, collection, environment, and guide now cover
  all 176 controller routes, including the provider callback; the REST Client
  examples also include the checkout/status/callback flow.

Do not copy provider secrets into the repository or into issue comments. Before
a sandbox run, set the required Paymob variables in the untracked environment
and confirm the integration ID belongs to the same sandbox account. The Paymob
notification URL must be public HTTPS. A loopback HTTP redirection URL is
accepted only outside production for local browser testing; shared sandbox,
staging, and production must use an HTTPS frontend result URL.

## Gaps closed by this branch

### 1. Intention request is sandbox-complete

`PaymobClient.createPaymentIntention()` now sends the following backend-owned
fields:

- a single server-authored Gold plan item whose amount equals the attempt;
- customer first name, last name, and email;
- complete billing data using the user's stored profile and Paymob-safe `NA`
  placeholders where allowed;
- the user's stored E.164 phone number; reject checkout with a stable profile
  error if it is missing;
- configured HTTPS `notification_url` and `redirection_url` values.

Do not accept price, currency, duration, callback URL, redirect URL, or Paymob
integration IDs from the browser.

### 2. Checkout provides a complete browser handoff

`PAYMOB_PUBLIC_KEY` is part of enabled-provider configuration and the response
returns a backend-built `checkoutUrl`:

```json
{
  "paymentId": "<internal UUID>",
  "checkout": {
    "provider": "paymob",
    "checkoutUrl": "https://accept.paymob.com/unifiedcheckout/?publicKey=<public>&clientSecret=<client-secret>"
  }
}
```

The public key and client secret are browser-safe checkout inputs. Merchant
secret keys, the HMAC secret, authorization headers, and raw provider responses
must never be returned or logged.

### 3. The callback locates its attempt safely

`NormalizedPaymentTransaction` includes bounded callback correlation facts:

- `merchantOrderId` from `obj.order.merchant_order_id`;
- signed `orderId` and `transactionId`;
- `amountCents`, normalized uppercase `currency`, and `integrationId`;
- `pending`, `success`, and an `isLive` consistency signal when present.

Require the merchant reference format `sharek:payment:<UUID>` and use the UUID
only to locate a candidate attempt. Acceptance still requires the verified
HMAC, globally unique signed transaction/order IDs, exact amount/currency, the
configured integration ID, provider, and expected sandbox/live mode.

The configured integration ID is the primary environment binding because it is
inside the signed HMAC field set. Treat `is_live` only as an additional
fail-closed consistency check; do not use an unsigned field as proof.

### 4. Different idempotency keys cannot create parallel pending purchases

The branch adds a partial unique index allowing only one pending subscription purchase for
`(user_id, user_role_context, provider)`. Keep the existing
`(user_id, idempotency_key)` uniqueness for command replay.

- Same idempotency key and same facts: reuse the attempt and handoff.
- Same key with different facts: `PAYMENT_IDEMPOTENCY_CONFLICT`.
- Different key while an otherwise identical purchase is pending: reuse the
  existing attempt and hosted checkout; do not create another Paymob Intention.
- Different key with different purchase facts: return the stable
  `PAYMENT_PURCHASE_ALREADY_PENDING` conflict.
- A terminal failed/cancelled attempt does not block a new attempt.
- An active Gold subscription still blocks checkout through subscription policy.

### 5. Provider IDs are unique when present

The migration adds database uniqueness for non-null provider transaction and order IDs. This
prevents one provider transaction from ever being attached to two attempts,
even under concurrent delivery or a changed untrusted merchant reference.

### 6. Subscription activation has a purchase-specific command

The exported subscriptions command accepts a Prisma transaction and:

- validates Gold, the role context, a positive 30-day period, and
  `source = payment_provider` internally;
- retires/replaces any active row for that user and role context inside the
  transaction so the existing partial active-subscription constraint remains
  valid;
- creates the new Gold row with `starts_at/current_period_start = processedAt`
  and both end fields at `processedAt + 30 days`;
- is called only by the verified payment workflow for provider activation;
- never lets Payments write `Subscription` directly.

The payment service supplies identity and plan facts; the subscriptions service
owns the final subscription invariant.

## Target flow

```text
Authenticated user
  -> POST /me/subscription/checkout
  -> validate active role + stored payment profile
  -> resolve Gold facts from subscription catalog
  -> create/reuse one pending PaymentAttempt
  -> create Paymob Intention with Share-k reference and public URLs
  -> return internal paymentId + Unified Checkout URL

Paymob
  -> POST /payments/paymob/webhook?hmac=...
  -> verify callback structure and HMAC
  -> extract sharek:payment:<UUID>
  -> insert/deduplicate bounded PaymentWebhookEvent
  -> lock PaymentAttempt in a database transaction
  -> compare provider, transaction/order IDs, amount, currency, integration,
     and sandbox/live expectation
  -> paid: transition attempt once + call subscriptions activation command
  -> declined: transition attempt once to failed; never activate
  -> duplicate: return 2xx without repeating either transition

Frontend result page
  -> ignores redirect claims as authority
  -> polls GET /me/payments/:paymentId
  -> shows the backend-persisted status
```

## Implementation sequence

### Phase 0 — Establish the branch baseline (complete)

1. Continue only in the dedicated worktree/branch recorded at the top of this
   file; do not mix the change with `feat/owner-github-connection`.
2. Rebase/merge the latest `origin/main` before implementation if main moves.
3. Re-run the existing payment/subscription focused tests, architecture check,
   and Prisma validation before editing.
4. Treat GitHub issue labels as stale until reconciled; do not reimplement
   PAY-01 through PAY-03 from the issue descriptions.

### Phase 1 — Make checkout compatible with current Paymob (complete)

Likely files:

- `.env.example`
- `src/shared/config/env.validation.ts` and its spec
- `src/modules/identity/services/payment-customer-profile.service.ts` and spec
- `src/modules/identity/identity.module.ts` and README
- `src/modules/payments/payments.types.ts`
- `src/modules/payments/integrations/paymob.client.ts` and spec
- `src/modules/payments/payments.service.ts` and spec
- `src/modules/payments/dto/payment-response.dto.ts`
- `src/modules/payments/payments.module.ts`

Actions:

1. Add and conditionally validate `PAYMOB_PUBLIC_KEY`,
   `PAYMOB_NOTIFICATION_URL`, and `PAYMOB_REDIRECTION_URL` when Paymob is
   enabled. Require HTTPS for externally used URLs.
2. Expose a narrow identity-owned payment customer profile service. It returns
   only first name, last name, email, E.164 phone, and the address fields needed
   by Paymob. It never exposes unrelated identity data.
3. Fail checkout before creating an attempt when required customer data is
   missing. Use a stable 400 error telling the user to complete their phone.
4. Send the complete Intention payload and keep all commercial fields
   server-authored.
5. Return `checkoutUrl` built by the backend. Preserve `paymentId` for polling.
6. Normalize `merchant_order_id` and the remaining PAY-04 comparison facts.

### Phase 2 — Add payment concurrency constraints (complete)

Likely files:

- `prisma/schema.prisma`
- a new PAY-04 Prisma migration
- `scripts/test-payment-persistence-migration.mjs`
- payment service/state tests

Actions:

1. Add the partial pending-purchase unique index in SQL.
2. Add provider transaction/order uniqueness compatible with nullable values.
3. Translate the expected Prisma uniqueness race into stable application
   errors instead of leaking a `P2002`.
4. Extend the real-PostgreSQL migration fixture to prove:
   duplicate pending purchase rejection, terminal retry allowance, provider ID
   uniqueness, and existing data survival.

### Phase 3 — Implement subscription activation (complete)

Likely files:

- `src/modules/subscriptions/entitlements.service.ts` and spec, or a focused
  `subscription-plan-assignment.service.ts` if the command makes the existing
  service difficult to understand
- `src/modules/subscriptions/subscriptions.module.ts`
- `src/modules/subscriptions/README.md`

Actions:

1. Add an exported transaction-aware purchased-plan activation command.
2. Make it responsible for retiring the prior active role-context record and
   creating one payment-provider Gold record.
3. Keep all subscription writes inside this service.
4. Unit-test period boundaries, source stamping, role isolation, replacement,
   and transaction-client use.

### Phase 4 — Implement PAY-04 webhook processing (complete)

Likely files:

- `src/modules/payments/paymob-webhook.controller.ts` and spec
- `src/modules/payments/payment-webhook.service.ts` and spec
- `src/modules/payments/payment-webhook-event.ts` and spec
- `src/modules/payments/payments.module.ts`
- `test/paymob-webhook.e2e-spec.ts`

Controller contract:

```http
POST /payments/paymob/webhook?hmac=<sha512-hex>
Content-Type: application/json
```

The route is intentionally not bearer-authenticated. Its authority is the
provider HMAC and exact stored-fact comparison. The controller must stay thin
and pass `body`, `hmac`, and a server timestamp to the service.

Processing order:

1. Enforce the global bounded JSON body limit and accept only a transaction
   envelope.
2. Verify and normalize through the Paymob provider before trusting any fact.
3. For a structurally valid callback with invalid HMAC, store only a bounded,
   allowlisted observation marked `verification_status = invalid` and
   `processing_status = ignored`; never attach it to an attempt or mutate
   payment/subscription state. Reject malformed input that cannot be minimized
   safely rather than storing raw attacker-controlled content.
4. Derive the event fingerprint from the bounded normalized facts. Use the
   Paymob transaction ID as an indexed `provider_event_id`; it is intentionally
   non-unique because Paymob can report pending and terminal states for the
   same transaction.
5. Insert the event and treat only an existing exact fingerprint as an
   idempotent duplicate. Do not acknowledge provider-ID ownership conflicts as
   callback replays.
6. In one Prisma transaction, lock the attempt, compare every expected fact,
   and bind the provider order/transaction IDs.
7. Map `success = true` and `pending = false` to `paid`; map a final declined
   callback to `failed`; treat `pending = true` as non-terminal and never
   activate. Do not infer `cancelled` or `refunded` in this slice.
8. On the first `pending -> paid` transition, call the exported subscription
   activation command in the same transaction.
9. Mark the webhook event processed only after the payment and subscription
   writes succeed. Mark exact mismatches ignored/failed with bounded diagnostic
   codes, not raw callback content.
10. Return `2xx` for processed and already-processed duplicates. Return a stable
    non-`2xx` error for invalid HMAC or malformed callbacks.

### Phase 5 — Update contracts and operational guidance (complete for backend)

Update:

- `src/modules/payments/README.md`
- `src/modules/subscriptions/README.md`
- `src/modules/README.md`
- `docs/api-contracts.md`
- `docs/database-plan.md`
- `docs/postman-api-guide.md`
- `sharek-api.http`
- `postman/sharek-backend.postman_collection.json`
- generated controller route inventory/API client artifacts
- `docs/module-development-tracker.md`

Add a short sandbox runbook that explains:

- required variable names without values;
- public backend webhook and frontend result URLs;
- Paymob dashboard URL configuration;
- how to start a payment, observe the attempt, and poll status;
- how to replay a captured sanitized callback fixture;
- rollback: set `PAYMENTS_PAYMOB_ENABLED=false` immediately;
- no production enablement without the explicit release gate.

## Required automated test matrix

| Area | Required cases |
|---|---|
| Configuration | disabled default; all enabled values required; invalid key/URL/integration formats; HTTPS boundary; no secret appears in validation output |
| Intention mapping | amount/currency/item equality; customer and all billing fields; callback/redirect URLs; special reference; provider failures/timeouts; malformed response |
| Checkout | active owner/contributor; role mismatch; missing phone; Free rejected; same-key replay; changed-fact conflict; different-key pending conflict; active Gold rejected; complete checkout URL only |
| HMAC/normalization | valid lowercase/uppercase digest; invalid length/content; malformed envelope; exact 20-field order; merchant reference; order/transaction IDs; amount/currency/integration; optional live consistency |
| Webhook success | pending attempt becomes paid; provider IDs bound; paid timestamp set; one Gold subscription created with `payment_provider`; event processed |
| Webhook failure | declined becomes failed; pending stays pending; invalid HMAC, wrong reference, amount, currency, integration, environment, provider, or ID never activates |
| Idempotency | sequential replay, concurrent replay, duplicate fingerprint, duplicate transaction ID, already-paid callback, and reordered JSON never activate twice |
| Subscription | exact 30-day period; owner/contributor isolation; prior active row retired; only one active row; transaction rollback leaves no partial activation |
| HTTP/E2E | public webhook does not require bearer auth; invalid UUID/reference handled; valid fixture returns 2xx; duplicate returns 2xx; payer status changes; another user still cannot read it |
| Migration | apply from the previous schema, preserve representative rows, enforce new unique constraints, and insert a valid post-migration callback/activation fixture |

Use deterministic synthetic callback fixtures and test HMAC secrets. Do not put
real Paymob payloads, keys, HMAC values, card data, or client secrets in Git.

## Quality gates

Run sequentially from this worktree:

```bash
npm run prisma:generate
npx prisma validate
npm run test:migrations:payments
npm test -- --runInBand src/modules/payments src/modules/subscriptions src/modules/identity
npm test -- --runInBand src/modules/payments/paymob-webhook.controller.spec.ts
npm run check:architecture
npm run lint
npx tsc --noEmit
npm run test:postman
npm run test:api-clients
npm test -- --runInBand
npm run build
```

If the migration fixture cannot reach PostgreSQL, record the migration gate as
environment-blocked and rerun it against the repository Docker Compose
PostgreSQL service before merge; do not report a migration as verified from
`prisma validate` alone.

## Sandbox execution runbook

Run this only in an isolated sandbox environment after the Paymob dashboard
has been configured. Keep these values in the untracked environment file; do
not paste them into GitHub, logs, or chat.

1. Set `PAYMENTS_PAYMOB_ENABLED=true`, `PAYMOB_EXPECTED_LIVE=false`, and keep
   the existing sandbox secret/public/HMAC keys and integration ID values.
2. Set `PAYMOB_NOTIFICATION_URL` to the public HTTPS backend endpoint ending in
   `/payments/paymob/webhook`, and `PAYMOB_REDIRECTION_URL` to the public HTTPS
   frontend result page ending in `/payments/result`.
3. Configure the same notification and redirection URLs in the Paymob sandbox
   dashboard, and confirm the configured integration ID belongs to that
   sandbox account and EGP payment method.
4. Start PostgreSQL and Redis, apply migrations, then start the backend and
   frontend. From the authenticated frontend, start Gold checkout and retain
   only the returned `paymentId` and `checkoutUrl`; never log the client secret
   or merchant secrets.
5. Let Paymob deliver the callback. The frontend must poll
   `GET /me/payments/:paymentId` and display the persisted backend status; query
   parameters on the browser redirect are not payment authority.
6. Verify one success, one decline, a callback replay, an invalid HMAC, a
   wrong amount, and a redirect-without-callback. The expected outcomes are,
   respectively: one 30-day Gold row, one failed attempt with no entitlement,
   an idempotent 2xx with no second entitlement, rejection with no state
   transition, rejection with no state transition, and a pending attempt.
7. Roll back immediately by setting `PAYMENTS_PAYMOB_ENABLED=false` and
   restarting the backend. Do not enable shared demo or production traffic
   until PAY-06 records the evidence and the product/security decision.

## Verification recorded on 2026-08-18

- Passed: Prisma generation/validation, architecture check, lint, exact
  TypeScript, build, `git diff --check`, Postman coverage, and API-client
  validation.
- Passed: focused payment/subscription/identity/config and GitHub regression
  coverage — 15 suites and 119 tests.
- Passed: complete Jest run — 170 suites passed (one optional realtime suite
  skipped), with 1,284 tests passed and two optional tests skipped.
- Passed: `npm run test:migrations:payments` against the running PostgreSQL
  service, and `prisma migrate deploy` applied
  `20260818100000_payment_callback_invariants` to the local `sharek` database.
- At the time of this verification, the local environment was disabled and no
  external Paymob request was attempted; the live sandbox gate remains
  intentionally open.
- Current untracked-environment audit after this verification: the Paymob flag,
  provider keys, and one integration ID are present, but
  `PAYMOB_NOTIFICATION_URL` and `PAYMOB_REDIRECTION_URL` are still missing.
  Keep the application stopped or supply public HTTPS URLs before restarting;
  do not substitute localhost URLs.

Follow-up audit on 2026-08-18 found the local flag enabled while both public URL
variables were still absent. In that state Nest configuration correctly rejects
startup; the full Jest suite passes when the flag is explicitly disabled for
local verification (`170` suites, `1,286` tests). Set the two public URLs and
configure the Paymob dashboard before enabling the flag again.

The same audit corrected callback replay semantics: exact normalized callback
fingerprints remain unique, while `provider_event_id` is indexed but non-unique
so one Paymob transaction can progress from pending to success. It also made
provider-ID ownership conflicts fail closed, records invalid signed merchant
references as bounded audit events, and requires an HTTPS Paymob API endpoint
in every environment. Focused regression coverage and the PostgreSQL migration
round-trip pass with these corrections.

## Live sandbox gate after implementation

Automated completion of this branch does not prove Paymob account readiness.
PAY-06 must still demonstrate, with no secrets in logs or evidence:

1. the configured integration ID belongs to the sandbox key and EGP method;
2. the Paymob dashboard sends to the public HTTPS backend callback URL;
3. Unified Checkout returns to the public frontend result URL;
4. one successful test payment activates Gold exactly once;
5. one declined test payment becomes failed and activates nothing;
6. replaying the successful callback leaves one subscription and one payment
   transition;
7. invalid HMAC and wrong amount/currency/reference/integration/environment
   activate nothing;
8. redirect-without-callback leaves the attempt pending;
9. disabling `PAYMENTS_PAYMOB_ENABLED` removes checkout availability without a
   deployment rollback;
10. an explicit product/security decision is recorded before any shared or
    production enablement.

## Issue tracker reconciliation after verification

Do this only after confirming the merged commits and current gate results:

- #102: record that PAY-01 is merged; close it or narrow it to the provider-
  contract hardening included here.
- #103: remove stale `blocked`/`needs-decision`, link the merged persistence and
  catalog evidence, and close.
- #105: remove stale `blocked`, link checkout/status evidence, and close after
  this branch's Paymob compatibility hardening passes.
- #106: replace stale PAY-02/PAY-03 blockers with the remaining live PAY-00
  operational gate; mark implementation ready while keeping sandbox release
  blocked.

No GitHub issue should claim live sandbox success until PAY-06 records it.

## Definition of done for this branch

- A complete server-priced Paymob Intention can be created for an eligible user
  with a complete payment profile.
- The response contains a usable Unified Checkout URL and no merchant secret.
- Only one pending purchase exists for a user and role context.
- A valid Paymob transaction callback is verified and correlated to exactly one
  attempt using the internal reference plus exact provider/payment facts.
- The first verified success marks the attempt paid and creates one 30-day Gold
  subscription through the subscriptions module in one transaction.
- Duplicate, declined, pending, invalid, and mismatched callbacks never repeat
  or create activation.
- Payment status remains payer-scoped and browser redirect data remains
  non-authoritative.
- Migration round-trip, focused tests, HTTP controller coverage, architecture,
  lint, exact typecheck, full tests, Postman/API-client validation, and build
  pass.
- Documentation and the module tracker describe the real behavior and remaining
  live sandbox/release gates.
