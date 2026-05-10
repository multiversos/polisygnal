# PolySignal Privacy Launch Checklist

Last updated: 2026-05-10

Use this checklist before moving from local-only user data to real customer
accounts. It is intentionally conservative and does not authorize migrations,
auth, payments, or production writes by itself.

## Before Login

- Public copy explains that Historial and Mi lista are saved in this browser.
- Users can delete local analysis history.
- Users can clear local watchlist data.
- Corrupt localStorage does not break public pages.
- No sensitive account data is stored locally.
- No frontend code claims data is synced between devices.
- No local records are used as trusted billing, compliance, or official
  performance evidence.

## Before Saving Customer Data In The Database

- Every customer-owned table has `owner_id`.
- `owner_id` is required and indexed.
- API writes derive `owner_id` from the session, not from the client payload.
- Read queries are scoped to the session owner.
- Cross-user access tests exist.
- Admin actions are audited.
- Service-role credentials are never sent to the frontend.
- URL, title, reason, and note lengths are limited.
- Raw HTML and unbounded external payloads are rejected.
- Backups are enabled.
- Restore test is documented and run.

## Before Payments

- Use a payment provider such as Stripe instead of storing card data.
- Do not store raw card numbers, CVV, or bank credentials.
- Verify webhook signatures.
- Keep payment provider secrets server-side only.
- Audit subscription state changes.
- Confirm pricing and cancellation copy before public launch.

## Before External Research Or Link Fetching

- Keep `/analyze` protected by SSRF validation.
- Add rate limiting before any external network lookup exists.
- Define allowed sources and blocked private networks.
- Cap request size, timeout, redirect count, and response size.
- Log source metadata without secrets or private tokens.
- Treat Reddit and other community signals as weak context, not authoritative
  outcomes.

## Before Production With Customers

- Publish privacy policy.
- Publish terms of service.
- Add account data export flow.
- Add account deletion flow.
- Add local-to-account import disclosure.
- Confirm incident response runbook owners.
- Confirm dependency monitoring is active.
- Confirm security smoke covers public pages.
- Confirm `/internal/data-status` is not in public navigation.
- Confirm no production route exposes secrets, stack traces, raw payloads, or
  connection strings.

## Launch Blockers

- Any customer-owned table without `owner_id`.
- Any frontend bundle containing service-role credentials.
- Any public page printing full connection strings or secrets.
- Any API that trusts client-supplied `owner_id`.
- Any import/migration plan without rollback and smoke validation.
- Any payment flow that stores card data directly.
