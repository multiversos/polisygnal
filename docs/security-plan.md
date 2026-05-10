# PolySignal Security Plan

Last updated: 2026-05-10

This document captures the current defensive security baseline for PolySignal.
It is intentionally conservative: no production writes, no trading, no
migrations, and no customer authentication or payment system are active yet.

## Public Surface Audit

Public product routes reviewed:

- `/`
- `/sports`
- `/sports/soccer`
- `/briefing`
- `/alerts`
- `/watchlist`
- `/history`
- `/analyze`
- `/markets/[id]`

Internal route reviewed:

- `/internal/data-status`

Findings:

- The public sidebar contains only product navigation and does not link to
  `/internal/data-status`.
- Public pages are checked by production smoke for accidental exposure of
  obvious secret markers, connection strings, stack traces, raw payload labels,
  and technical terms.
- `/internal/data-status` remains directly reachable but read-only. It must not
  expose secrets, connection strings, stack traces, large raw payloads, or write
  actions.

## Web Security Headers

The Next.js app sets baseline security headers for all routes:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy`
- `Strict-Transport-Security`

The CSP is intentionally conservative but still allows the inline styles/scripts
Next.js needs today. Tighten it later after nonce-based rendering is tested in
production.

## Link Analyzer Input Security

The `/analyze` flow is frontend-only in the current phase. It does not fetch the
submitted URL, does not follow redirects, and does not scrape Polymarket.

Accepted links:

- `https://polymarket.com/event/...`
- `https://polymarket.com/market/...`
- `https://polymarket.com/sports/...`
- the same links with `www.polymarket.com`
- links missing `https://`, which are normalized before comparison

Rejected inputs:

- non-Polymarket domains
- `localhost`
- `127.0.0.1`
- `0.0.0.0`
- `::1`
- `169.254.169.254`
- private IPv4 ranges
- `file:`
- `javascript:`
- `data:`
- `ftp:`
- URLs with usernames/passwords or custom ports
- oversized URLs

## Backend Proxy Security

The frontend proxy at `/api/backend/[...path]` is read-only and only accepts
`GET`. It is constrained to known backend prefixes and rejects path traversal.

Current controls:

- allow-list of backend path prefixes;
- no forwarding to arbitrary hostnames;
- query length limit;
- request timeout;
- `no-store` cache headers;
- generic public error responses;
- safe response content type check;
- no secrets or backend connection details in user-facing errors.

Future hardening:

- per-prefix query parameter allow-lists;
- request counters/rate limiting;
- monitoring for unusual 404/414/504 patterns.

## Logs And Secrets

Repo scan notes:

- No `.env` files were opened or modified during this audit.
- CI contains local test-only Postgres credentials for the ephemeral service
  database. These are not production credentials.
- The manual soccer dry-run workflow references
  `secrets.POLYSIGNAL_NEON_DATABASE_URL` but does not print its value.
- Backend database diagnostics include masking/redaction helpers and tests.
- Some operational docs show placeholder connection string formats. They must
  remain placeholders and never include real credentials.

Rules:

- Never commit real `.env` files.
- Never print full database URLs, tokens, API keys, OAuth secrets, or service
  keys.
- Redact secret-like fields from reports before writing JSON artifacts.
- Keep raw payload dumps out of public UI.

## Dependency Audit

Audit commands run:

```powershell
npm.cmd audit --workspace apps/web --audit-level=moderate
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m pip show pip-audit
```

Result:

- `npm audit` reported a moderate PostCSS advisory through the current Next.js
  dependency tree. The offered automatic fix is `npm audit fix --force`, which
  would install an incompatible/breaking Next version, so no automatic upgrade
  was applied in this sprint.
- `pip check` reported no broken Python requirements.
- `pip-audit` is not installed in the local API virtual environment, so no Python
  vulnerability database audit was run.

Recommended next step:

- Review the Next.js/PostCSS advisory during a planned dependency maintenance
  window and upgrade through a normal Next.js-compatible path, not through
  `npm audit fix --force`.

## Rate Limiting And Abuse Prevention Plan

Short-term:

- Limit `/analyze` input length in the browser.
- Keep `/analyze` frontend-only until backend lookup is designed.
- Keep proxy timeout and query length limits.

Before customer launch:

- Add IP-based rate limiting for `/analyze` and `/api/backend/*`.
- Prefer a managed low-friction option such as Cloudflare/WAF, Vercel
  middleware, Upstash Redis, or Render/FastAPI middleware depending on the final
  hosting boundary.
- Add per-user rate limits after login exists.
- Add daily caps for any future external search/research calls.
- Log abuse counters without logging submitted secrets or full private URLs.

## Customer Data Security Model

Likely data to store later:

- email;
- analysis history;
- watchlist markets;
- analyzed links;
- preferences;
- subscription status.

Data not planned for storage:

- raw card numbers;
- private keys;
- plaintext passwords.

Principles:

- collect the minimum data needed;
- every customer-owned row gets an `owner_id`;
- users can only read their own data;
- admin/user roles are explicit;
- admin actions are audited;
- backups and restore drills are documented;
- account/data deletion is supported;
- no secrets in frontend bundles;
- TLS in transit;
- backend or database policies enforce ownership.

Possible future tables:

- `users` / `profiles`
- `analysis_history`
- `watchlist`
- `alerts`
- `subscriptions`

Recommended controls before customer data:

- authentication;
- row-level security or backend-enforced ownership checks;
- secure session handling;
- safe logging;
- backup/restore plan;
- incident response checklist.
