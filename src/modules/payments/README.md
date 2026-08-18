# Payments Module

PAY-01 through PAY-04 own the isolated, disabled-by-default Paymob sandbox
foundation authorized by DEC-077. The module owns provider configuration, the
narrow provider-facing contract, Paymob HTTP mapping, response validation,
transaction callback HMAC verification/normalization, payment-attempt rows,
checkout idempotency, payment status reads, and deduplicated webhook processing.
Subscription rows remain owned by the subscriptions module.

## Internal provider seam

`PAYMENT_PROVIDER` is a module-private NestJS provider token implementing
`PaymentProvider` from `payments.types.ts`. The seam currently exposes only:

- `createPaymentIntention()` for a one-time intention;
- `verifyAndNormalizeTransactionCallback()` for a verified Paymob transaction
  callback.

Intention creation returns the Paymob intention identifier, browser-safe client
secret, and backend-built Unified Checkout URL. Callback normalization returns
only the transaction facts the payment workflow must compare: merchant
reference, transaction/order identifiers, amount, currency, integration,
pending, success, and the optional live-mode signal.

Other modules call the exported `PaymentsService`; the Paymob adapter and its
provider token are not part of the module's public interface.

The public routes currently are:

- `GET /subscriptions/plans` — the backend-owned Free/Gold catalog;
- `POST /me/subscription/checkout` — an authenticated, role-context-checked
  Paymob checkout command;
- `GET /me/payments/:paymentId` — an authenticated owner/contributor read of
  payment state.
- `POST /payments/paymob/webhook` — a public Paymob transaction callback;
  provider HMAC verification, not bearer auth, is its authority.

The catalog currently exposes Free at `0 EGP` with no checkout and Gold at
`50,000` minor units (`500 EGP`) for 30 days in both role contexts. Prices and
duration are resolved by the subscriptions module; clients cannot override
them.

The checkout command never writes Subscription rows and never activates a plan.
`PaymentAttemptStatus` permits only `pending -> paid|failed|cancelled` and the
reserved `paid -> refunded` path; repeating the current state is idempotent and
terminal states cannot be retried. A partial unique index permits only one
pending subscription purchase per user, role context, and provider.

`PaymentAttempt` is unique by `(user_id, idempotency_key)` and stores the
Paymob client secret and hosted checkout URL returned for that attempt so an
idempotent retry can reuse the same handoff. These are scoped checkout inputs,
not Paymob merchant credentials, and are returned only in the checkout DTO.
Non-null provider order and transaction IDs are unique per provider.
If a pre-migration pending attempt has a client secret but no stored URL, the
Paymob adapter rebuilds and persists the URL during the idempotent replay.
`PaymentWebhookEvent` stores only a minimized JSON payload and is
duplicate-protected by both the provider event identity (when available) and a
deterministic fingerprint.
Webhook verification and processing are separate statuses so a later callback
workflow can record an invalid signature without implying processing success.
The `minimizePaymentWebhookPayload()` and
`createPaymentWebhookFingerprint()` helpers derive the stored payload and
SHA-256 fingerprint from normalized provider facts, never from raw callback
content.

Concurrent retries for one PaymentAttempt are serialized by a bounded
PostgreSQL transaction advisory lock while the intention is created. A retry
therefore re-reads the stored provider intention instead of creating a second
Paymob checkout. Concurrent callbacks use a transaction advisory lock for the
attempt and mark the webhook event processed only after the payment and
subscription writes succeed.

## Configuration

`PAYMENTS_PAYMOB_ENABLED` defaults to `false`. When enabled, the Paymob secret
key, public key, HMAC secret, HTTPS notification URL, HTTPS redirection URL,
and non-empty comma-separated numeric integration-ID list are required.
`PAYMOB_EXPECTED_LIVE` binds callbacks to the expected sandbox/live mode.
`PAYMOB_API_BASE_URL` defaults to the current Paymob Egypt HTTPS base URL,
`PAYMOB_INTENTION_PATH` defaults to `/v1/intention/`, and
`PAYMOB_REQUEST_TIMEOUT_MS` is bounded to 100–30,000 ms. Production rejects a
non-HTTPS base URL. Use placeholders only; credentials belong in an approved
secret store or an untracked local environment.

The adapter fails closed with stable `ApplicationError` codes when disabled or
incompletely configured. Provider payloads, credentials, client secrets, raw
authorization headers, and callback payloads are never logged.

## Trust boundary

The adapter sends only backend-owned, typed intention inputs to Paymob. It
validates the response instead of casting it. Callback data is untrusted until
the `TRANSACTION` envelope and required nested fields are structurally valid
and the exact ordered Paymob concatenation matches an HMAC-SHA512 digest using a
length-checked `timingSafeEqual` comparison.

The adapter follows the documented Intention flow and client-secret checkout
handoff. It maps only backend-owned plan facts plus the allowlisted customer
profile, billing placeholders, callback URLs, and unique merchant reference;
the browser cannot override price, currency, integrations, or callback URLs.

## Persistence

The migration `20260813120000_payment_attempts_and_webhook_events` adds the
provider, purpose, attempt-status, webhook-verification, and webhook-processing
enums plus the two payment-owned tables and their foreign keys/indexes.
`20260813150000_payment_checkout_handoff` adds the persisted Paymob client
secret; `20260818100000_payment_callback_invariants` adds the hosted checkout
URL and callback uniqueness/concurrency indexes. These migrations do not write
`Subscription` rows. Only a verified callback may call the exported
subscriptions activation command.

## Verified callback processing

`POST /payments/paymob/webhook?hmac=<sha512-hex>` accepts a Paymob
`TRANSACTION` envelope without a bearer token. The service verifies the exact
20-field HMAC, requires the `sharek:payment:<uuid>` merchant reference, and
compares the signed transaction/order IDs, amount, uppercase currency,
configured integration ID, expected sandbox/live mode, and stored provider.

Pending callbacks remain pending. A later final callback may reuse the same
Paymob transaction ID; exact fingerprints prevent replay while distinct state
facts remain processable. A final success transitions the attempt to `paid`
and calls `EntitlementsService.activatePurchasedPlan()` in the same
transaction; a final decline transitions it to `failed`. The subscriptions
service retires the prior active role-context row and creates one 30-day Gold
row with `source = payment_provider`. Duplicate, already-terminal, and exact
mismatch callbacks return a safe 2xx outcome without repeating activation.
Invalid signatures and malformed envelopes are rejected after storing only a
bounded, allowlisted diagnostic payload.

## Operational release gate

The code path is complete, but the feature remains disabled by default. A
sandbox exercise still needs the Paymob keys, matching integration ID, public
HTTPS notification URL, public frontend redirection URL, and dashboard
configuration. No browser redirect can mutate payment or subscription state;
the verified callback and payer-scoped status endpoint are authoritative.
