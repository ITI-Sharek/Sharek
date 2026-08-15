# Payments Module

PAY-01 through PAY-03 own the isolated, disabled-by-default Paymob sandbox
foundation authorized by DEC-077. The module owns provider configuration, the
narrow provider-facing contract, Paymob HTTP mapping, response validation,
transaction callback HMAC verification/normalization, payment-attempt rows,
checkout idempotency, payment status reads, and deduplicated webhook-event
rows.

## Internal provider seam

`PAYMENT_PROVIDER` is a module-private NestJS provider token implementing
`PaymentProvider` from `payments.types.ts`. The seam currently exposes only:

- `createPaymentIntention()` for a one-time intention;
- `verifyAndNormalizeTransactionCallback()` for a verified Paymob transaction
  callback.

Intention creation returns only the Paymob intention identifier and client
secret needed by a later checkout service. Callback normalization returns only
the transaction facts a later payment workflow must compare: transaction/order
identifiers, amount, currency, integration, pending, and success.

Other modules call the exported `PaymentsService`; the Paymob adapter and its
provider token are not part of the module's public interface.

The public routes currently are:

- `GET /subscriptions/plans` — the backend-owned Free/Gold catalog;
- `POST /me/subscription/checkout` — an authenticated, role-context-checked
  Paymob checkout command;
- `GET /me/payments/:paymentId` — an authenticated owner/contributor read of
  payment state.

The catalog currently exposes Free at `0 EGP` with no checkout and Gold at
`50,000` minor units (`500 EGP`) for 30 days in both role contexts. Prices and
duration are resolved by the subscriptions module; clients cannot override
them.

The checkout command never writes Subscription rows and never activates a plan.
`PaymentAttemptStatus` permits only `pending -> paid|failed|cancelled` and the
reserved `paid -> refunded` path; repeating the current state is idempotent and
terminal states cannot be retried.

`PaymentAttempt` is unique by `(user_id, idempotency_key)` and stores the
Paymob client secret returned for that attempt so an idempotent retry can reuse
the same hosted checkout handoff. This client secret is scoped checkout data,
not a Paymob merchant credential, and is returned only in the checkout DTO.
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
Paymob checkout.

## Configuration

`PAYMENTS_PAYMOB_ENABLED` defaults to `false`. When enabled, the Paymob secret
key, HMAC secret, and non-empty comma-separated numeric integration-ID list are
required. `PAYMOB_API_BASE_URL` defaults to the current Paymob Egypt HTTPS base
URL, `PAYMOB_INTENTION_PATH` defaults to `/v1/intention/`, and
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

The official docs confirm the Intention flow, client-secret checkout handoff,
and `https://accept.paymob.com` Egypt base URL. The JS-gated full API schema
does not provide additional fields in the canonical plan, so PAY-01 maps only
the plan-grounded `amount`, `currency`, `payment_methods`, and
`special_reference` fields and deliberately does not invent billing/items data.

## Persistence

The migration `20260813120000_payment_attempts_and_webhook_events` adds the
provider, purpose, attempt-status, webhook-verification, and webhook-processing
enums plus the two payment-owned tables and their foreign keys/indexes.
`20260813150000_payment_checkout_handoff` adds the persisted Paymob client
secret required for safe idempotent browser retries. These migrations do not
alter `Subscription` rows. Only a later verified callback workflow may call the
exported Subscriptions service to assign a plan.

## Deferred work

PAY-04 may add the webhook route, payment-fact checks, exactly-once payment
transition, and Subscription-owned plan assignment after the PAY-00 release
gates close. Checkout remains disabled by default and no browser redirect can
mutate payment or subscription state.
