# Payments Module

PAY-01 owns the isolated, disabled-by-default Paymob sandbox provider
foundation authorized by DEC-077. It owns provider configuration, the narrow
provider-facing contract, Paymob HTTP mapping, response validation, and
transaction callback HMAC verification/normalization.

## Public provider seam

`PAYMENT_PROVIDER` is the exported NestJS provider token implementing
`PaymentProvider` from `payments.types.ts`. The seam currently exposes only:

- `createPaymentIntention()` for a one-time intention;
- `verifyAndNormalizeTransactionCallback()` for a verified Paymob transaction
  callback.

Intention creation returns only the Paymob intention identifier and client
secret needed by a later checkout service. Callback normalization returns only
the transaction facts a later payment workflow must compare: transaction/order
identifiers, amount, currency, integration, pending, and success.

There is intentionally no controller, route, payment table, checkout service,
subscription writer, repository abstraction, use-case layer, cancellation,
refund, invoice, recurring-billing, reward, escrow, or payout operation.

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

## Deferred work

PAY-02+ must first close the product/catalog/account decisions in PAY-00. A
later slice may add backend-owned prices/currency, payment persistence,
idempotent checkout/status APIs, a webhook route, payment-fact checks, and
Subscription-owned plan assignment. Those changes are not part of PAY-01.
