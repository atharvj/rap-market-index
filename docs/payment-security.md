# Future Payment Security Contract

RMI does not currently accept payments. Do not add billing until the implementation satisfies all of these requirements:

- The browser sends a server-owned product or price identifier, never a trusted dollar amount.
- The server resolves the price and entitlement from an allowlist.
- Checkout sessions are created only for a confirmed authenticated user.
- Webhook signatures are verified against the untouched raw request body.
- Webhook event IDs are stored with a unique constraint so retries are idempotent.
- Access is granted from a verified successful webhook, not from a browser redirect.
- Refunds, disputes, cancellations, and subscription expiration revoke access correctly.
- Payment provider customer IDs are private and never exposed through public profile APIs.
- Test-mode and live-mode keys, products, endpoints, and webhooks cannot be mixed.
- No card number, security code, or full payment method is stored by RMI.

Use a hosted checkout from a payment processor and complete that processor's production checklist before accepting money.
