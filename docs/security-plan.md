# PolySignal Security Plan

Last updated: 2026-05-12

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

The `/analyze` flow validates the user-submitted URL in the browser, then sends
it to a same-origin server route for structured read-only resolution. It never
fetches the submitted URL as a destination, never follows redirects from the
submitted URL, and does not scrape Polymarket HTML.

The public analyzer flow is automatic: the user pastes a Polymarket link,
PolySignal resolves the market, loads Polymarket/Gamma data, runs Wallet
Intelligence when compatible data exists, and attempts Samantha through the
server-side bridge. Public UI must not ask users to upload reports, paste
external evidence, copy schemas, download task packets, or inspect raw JSON. If
Samantha or another source is unavailable, the UI must say the automatic source
is unavailable or show a partial reading.

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

## Structured Link Resolution Security

`POST /api/analyze-polymarket-link` is the only primary source used by
`/analyze` to identify the event or market behind a pasted link. It is read-only
and is not a general proxy.

Controls:

- accepts `POST` only;
- validates the URL with the hardened Polymarket helper before any outbound
  request;
- accepts only a bounded `url` field;
- rejects credentials, custom ports, non-Polymarket hosts, private IPs,
  metadata IPs, dangerous schemes, and oversized inputs;
- extracts the Polymarket slug and builds the Gamma request internally;
- calls only `https://gamma-api.polymarket.com/events?slug=...` or
  `https://gamma-api.polymarket.com/markets?slug=...`;
- for exact `/market/...` links, may derive the parent event slug from the same
  dated market slug and then keep only the exact requested market from the Gamma
  event response;
- uses short timeout, `no-store`, no cookies, no credentials, and redirects
  disabled;
- limits response size before parsing;
- returns only normalized event/market fields, outcomes, prices, volume,
  liquidity, state, remote ids, condition id, warnings, and checked timestamp;
- does not return raw Gamma payloads, stack traces, secrets, or backend URLs;
- does not use `/markets/overview`, `/sports/soccer`, or internal loaded
  markets as the primary link matching source.

If Gamma cannot return the event or market, `/analyze` must show an honest
unavailable state. It must not show a market from another sport or a merely
similar internal market.

## Structured Market Resolution Security

Historial can verify pending saved analyses through `/api/resolve-polymarket`.
This route is read-only and exists only to normalize final market status; it is
not a general proxy.

Controls:

- accepts `POST` only;
- validates Polymarket URLs with the same hardened helper used by `/analyze`;
- accepts only bounded string fields such as `eventSlug`, `marketSlug`,
  `remoteId`, `conditionId`, and `url`;
- builds the outbound Gamma URL internally as
  `https://gamma-api.polymarket.com/events?slug=...`;
- rejects arbitrary hosts, credentials, custom ports, private IPs, and oversized
  inputs;
- uses `GET`, short timeout, `no-store`, no cookies, no credentials, and
  dangerous redirects disabled;
- limits response size before parsing;
- returns only `status`, `outcome`, `source`, `confidence`, `reason`,
  `checkedAt`, and optional `resolvedAt`;
- never returns raw Gamma payloads, stack traces, secrets, or backend URLs.

Outcome parsing is conservative. It marks YES/NO only when Gamma shows a closed
resolved market and exposes a clear winner or final binary `outcomePrices`.
Closed markets without a clear structured outcome remain `unknown`.

## Wallet Intelligence Safety

Wallet Intelligence is prepared as a future read-only auxiliary signal. It is
not a customer-data feature and does not store wallet history today.

Current constraints:

- `/analyze` uses `/api/polymarket-wallet-intelligence`, a same-origin
  server-side route that accepts only sanitized market identifiers from the
  resolved Polymarket link and builds its own allowlisted Polymarket Data API
  requests.
- The legacy `walletIntelligenceAdapter.ts` remains available for numeric local
  market detail views, but it is not the primary wallet source for pasted
  Polymarket links.
- The wallet route does not accept a client-provided destination URL and does
  not use `/markets/overview`, `/sports/soccer`, or internal sports markets as
  fallback.
- Wallet summaries use a `100 USD` relevance threshold.
- Full wallet addresses must not be shown by default in the main analyzer view.
  The explicit `Ver billeteras` detail drawer may render full public wallet
  addresses returned by the allowlisted source, because the user requested full
  public wallet detail there. Agent payloads, summaries, logs and saved history
  still use sanitized summaries and must not store raw complete wallet lists.
- Public wallet data must never be mapped to real-world identities.
- No ROI, win rate, or wallet history is shown unless computed from reliable
  structured resolved-position data.
- Wallet Intelligence must not create a PolySignal estimate or `predictedSide`
  by itself.
- Public copy must describe wallet data as activity from public wallets, not as
  identity, insider knowledge, guaranteed edge, or copy-trading advice.
- Lookup failures return a generic unavailable state and must not expose raw
  payloads, backend details, or complete wallet lists by default.

Before expanding real wallet lookups:

- add rate limiting;
- keep lookups server-side;
- allowlist the structured source;
- use short timeout and response-size caps;
- avoid storing raw payloads;
- document retention and deletion rules;
- keep logs free of complete wallet lists.

## Samantha Result Lookup Safety

Nota `2026-05-14`: Samantha ahora es proveedor del `Analysis Agent Bridge` en
produccion mediante `ANALYSIS_AGENT_*`. La ruta generica es
`/api/analysis-agent/research-status`; la ruta
`/api/samantha/research-status` queda como alias compatible. Las mismas reglas
aplican para cualquier agente: no destino arbitrario desde cliente, no
`NEXT_PUBLIC` para tokens, no full wallets, no secretos, no copy-trading y no
market price como estimacion PolySignal.

`POST /api/samantha/research-status` lets the browser ask PolySignal to check a
known Samantha task id. It is not a proxy and does not accept destinations from
the client.

Controls:

- accepts only `POST`;
- accepts only a bounded `taskId` field;
- rejects fields such as `bridgeUrl`, `targetUrl`, `endpoint`, `destination`,
  `webhookUrl`, and similar client-provided destinations;
- reads Samantha bridge URL/token only through server-side configuration in
  the generic analysis agent registry/bridge helpers;
- uses `credentials: "omit"`, `redirect: "error"`, short timeout and response
  size limits;
- validates any completed report through the existing Samantha report validator
  before returning it to the UI;
- returns `pending`, `processing`, or `manual_needed` as waiting states, not as
  completed analysis;
- never exposes the bridge token, raw payloads, stack traces, full wallet
  addresses, or secret-like values.

## Deep Analyzer External-Layer Safety

The Deep Analyzer contracts expose future layers for external research, odds
comparison, Kalshi comparison, wallet profiles, evidence scoring, and final
decisioning. These layers are currently readiness states only unless a trusted
structured source already exists.

Current constraints:

- `/analyze` remains Polymarket-first and uses structured Polymarket/Gamma/CLOB
  data as its primary market source.
- The Deep Analyzer v0 must not trigger internet search, Reddit/social lookups,
  odds provider calls, Kalshi calls, or wallet profile lookups.
- Future layers must be labeled as pending, blocked, or unavailable until the
  integration is implemented and authorized.
- The UI must not claim that external research, odds comparison, Kalshi matching,
  or wallet profiling ran when those calls did not happen.
- Market price can appear as market probability only. It must not become a
  PolySignal estimate or prediction.
- Wallet Intelligence remains an auxiliary signal. It must not create a
  prediction without independent evidence scoring.
- Public responses must not include raw payloads, raw HTML, stack traces,
  provider credentials, or full wallet addresses.

Before enabling any external Deep Analyzer layer:

- run it server-side behind a narrow allowlist;
- add short timeouts, response-size limits, caching, and rate limiting;
- store only normalized, minimal fields;
- define source-quality and citation requirements;
- avoid aggressive HTML scraping;
- log redacted metadata only;
- add smoke/security checks proving disabled layers cannot be mistaken for real
  evidence.

## Samantha Research Safety

Samantha is treated as an external research agent. The public production-safe
mode is automatic-or-partial: PolySignal prepares sanitized context, attempts the
server-side bridge only when explicitly configured, and otherwise reports
`Fuente automatica no disponible` without asking the user to paste evidence.

Current controls:

- no uncontrolled agent execution;
- no outbound calls from PolySignal to Samantha or OpenClaw unless the
  server-side bridge config is explicitly enabled and allowlisted;
- no backend run, DB write, migration, scoring, trading, or command with
  `--apply`;
- task/context generation is local to `/analyze` and server-side bridge routes;
- debug-only packets include a research brief, plain-text Samantha instructions,
  expected JSON schema, return instructions, and safety rules;
- the packet includes normalized market fields and summarized wallet state only;
- the packet does not include raw payloads, full wallet addresses, secrets, or
  personal identity claims;
- the packet instructs Samantha to return only JSON, use real sources, avoid
  invented evidence, treat Reddit/social as weak, use Kalshi only for clear
  equivalents, use odds only when comparable, and avoid trading, DB access,
  secrets, doxxing, and identity mapping;
- public report upload/import is hidden by default and only available in local
  debug mode with `NEXT_PUBLIC_SHOW_ANALYZER_DEBUG_TOOLS=1`;
- report validator rejects unsafe URLs, secret-like text, full wallet addresses,
  invalid JSON, oversized text, invalid probabilities, Reddit/social high
  reliability, non-equivalent Kalshi strong signals, script-like text, trading
  instructions and unsupported ROI/win-rate claims;
- the UI validates reports before applying them to the local job;
- suggested estimates are accepted only after a strict evidence gate and remain
  traceable to the imported report.
- PolySignal estimate gates require all of these before a saved percentage can
  be marked as real: Polymarket market reference, validated Samantha report with
  an accepted suggested estimate, and at least one independent support from
  strong external evidence, Wallet Intelligence, wallet profiles, comparable
  odds, or an equivalent Kalshi comparison.
- A validated Samantha report below the 55% clear-decision threshold can remain
  useful context, but it must not create a countable history prediction.
- Dedicated test scripts cover the estimator gates and report validator:
  `test:estimate-gates` and `test:samantha-report-validation`. Fixtures are
  controlled, test-only records and must not be displayed as production
  evidence.

Camino B controls:

- `POST /api/samantha/send-research` accepts only a sanitized brief/task body;
- the client cannot provide the destination URL (`bridgeUrl`, `targetUrl`,
  `endpoint`, callback or similar keys are rejected);
- endpoint, token, localhost allowance, timeout and size limits are read only
  from server-side environment variables;
- the bridge helper blocks credentials in URLs, unsafe protocols, dangerous
  redirects, non-allowlisted ports and private network hosts unless localhost is
  explicitly allowed for local development;
- request uses `credentials: omit`, `redirect: error`, `no-store`, timeout and
  request/response size caps;
- if the bridge is disabled or unsafe, the route returns a controlled fallback
  response and the job remains `awaiting_samantha`;
- if Samantha returns a report, PolySignal validates it with the same report
  validator before exposing evidence.

Samantha-side local endpoints:

- Samantha exposes `POST /polysignal/analyze-market` only when
  `POLYSIGNAL_RESEARCH_BRIDGE_ENABLED=true`;
- `analyze-market` accepts only sanitized PolySignal market context, allowed
  Polymarket URLs, market price/volume/liquidity, and sanitized Wallet
  Intelligence. It does not fetch arbitrary URLs and returns `partial` or
  `insufficient_data` unless real independent evidence is available;
- Samantha also exposes `POST /polysignal/research-task` as a local/dev queue
  endpoint for Task Packets;
- the default listener remains local/dev (`127.0.0.1`), and remote requests are
  rejected unless explicitly allowed;
- a bearer token is required when `POLYSIGNAL_RESEARCH_BRIDGE_TOKEN` is set;
- the endpoints validate the PolySignal contract, Polymarket URL, payload
  size, dangerous destination keys, script-like text, full wallet addresses,
  secret-like text, and real-trading instructions;
- accepted tasks are written as sanitized summaries to a local JSONL queue and
  audit log;
- task status is exposed through `GET /polysignal/research-task/:taskId` with
  the same local/token checks. It returns `pending`, `processing`,
  `manual_needed`, `completed`, or `failed_safe`;
- PolySignal checks status through its own same-origin
  `POST /api/samantha/research-status` route, which accepts only `taskId` and
  rejects client-provided destination fields;
- Samantha returns `accepted`/`queued_or_manual` unless a future real research
  layer can produce a valid report. It does not fabricate evidence.

Deployable public bridge mode:

- Samantha can run `npm run start:polysignal-bridge` as a narrow web service;
- current Render host is `https://samantha-polysignal-bridge.onrender.com`;
- the public mode exposes only `GET /health` and
  `POST /polysignal/analyze-market`;
- production startup requires `SAMANTHA_BRIDGE_TOKEN`;
- CORS is restricted by `POLYSIGNAL_ALLOWED_ORIGIN`, with localhost allowed
  only for local/dev;
- `/polysignal/research-task`, NBA manual evidence, WhatsApp, OpenClaw and
  browser automation are not exposed by this service mode;
- Vercel should configure `ANALYSIS_AGENT_PROVIDER`,
  `ANALYSIS_AGENT_ENABLED`, `ANALYSIS_AGENT_URL`, `ANALYSIS_AGENT_TOKEN`,
  `ANALYSIS_AGENT_DISPLAY_NAME` and `ANALYSIS_AGENT_ALLOW_LOCALHOST`
  server-side. Legacy `SAMANTHA_BRIDGE_*` remains compatible but is not the
  preferred production path;
- `/api/analysis-agent/diagnostics` and `/internal/data-status` expose only
  sanitized diagnostics: provider, enabled, endpoint host, health status and
  expected state. They must never return credentials, headers, raw payloads or
  secrets;
- if the config is absent or Render is unavailable after retry, PolySignal must
  keep returning a controlled unavailable/partial fallback.

History and performance safety:

- `awaiting_samantha` and `ready_to_score` records are pending research states,
  not misses;
- `/performance` separates pending research from pending resolution;
- no pending Samantha state counts for accuracy until a clear PolySignal
  decision and a verified final Polymarket outcome exist.

Before automating Samantha:

- run the agent behind an explicit backend job boundary;
- isolate credentials and tools from PolySignal runtime secrets;
- use allowlisted destinations and rate limits;
- write redacted audit logs only;
- require human-visible validation before any saved estimate.

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

## Dependency Security Status

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
- Dependabot is configured for npm, pip, and GitHub Actions. It opens reviewable
  pull requests only; there is no auto-merge.
- Any future dependency update should run frontend build, production smoke, and
  targeted backend tests when backend dependencies change.

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

### Implementation Options

Option A - Vercel middleware + IP headers:

- Good for simple limits near the web edge.
- Useful for `/analyze` and `/api/backend/*`.
- Be careful with in-memory counters because serverless instances are not shared
  across regions or cold starts.

Option B - Upstash Redis:

- Recommended for distributed rate limiting.
- Requires new secrets and should not be implemented until the deployment
  secret-management flow is reviewed.
- Good fit for limits shared across Vercel and backend routes.

Option C - FastAPI middleware:

- Useful for protecting Render backend endpoints directly.
- Needs shared storage in production; in-memory counters are not enough for
  multiple instances.

Option D - Cloudflare/WAF:

- Good outer layer for path and IP based rules.
- Can throttle `/analyze` and `/api/backend/*` before traffic reaches Vercel.

Initial recommended limits before external research is enabled:

- `/analyze`: 20 analyses per IP per 10 minutes.
- `/api/backend/*`: 100 read requests per IP per 10 minutes.
- Higher limits only after authenticated users and per-account quotas exist.

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

### Future Customer Data Model

`users` / `profiles`:

- `id`
- `email`
- `role`
- `created_at`

`analysis_history`:

- `owner_id`
- `market_url`
- `market_id`
- `analyzed_at`
- `market_probability_yes`
- `polysignal_probability_yes`
- `result`

`watchlist`:

- `owner_id`
- `market_id`
- `created_at`

Rules:

- `owner_id` is required on customer-owned rows.
- A user can only read and write their own rows.
- Admin access requires explicit role checks and audit logging.
- Never expose service-role credentials to frontend code.
- Do not log secrets, full private URLs, session tokens, or payment artifacts.
- Support export, history deletion, and account deletion flows.
- Keep automatic backups and run restore tests before launch.

Incident basics:

- Rotate secrets if a token or connection string leaks.
- Disable compromised tokens.
- Review deploy history and logs.
- Notify affected users if customer data exposure is confirmed.

Recommended controls before customer data:

- authentication;
- row-level security or backend-enforced ownership checks;
- secure session handling;
- safe logging;
- backup/restore plan;
- incident response checklist.

Detailed future schema and migration notes live in
`docs/customer-data-architecture.md`.

### Future Access Control Model

Normal users:

- can read and write only their own analysis history;
- can read and write only their own watchlist;
- can read and write only their own alert preferences;
- never send a trusted `owner_id` from the browser.

Admins:

- can view aggregate metrics;
- should not view individual history unless there is an authorized support
  reason;
- must have support actions written to an audit log.

Service role:

- must never be present in frontend code;
- should only run on backend/server jobs or controlled operations;
- must never be printed in logs.

API ownership rules:

- derive `owner_id` from the authenticated session;
- ignore or reject any client-supplied `owner_id`;
- validate enum values, probability ranges, URL lengths, and title lengths;
- return generic public errors and keep internal details out of the UI.

RLS or backend enforcement:

- If Postgres RLS is used, each user-owned table needs policies scoped to the
  authenticated user id.
- If backend enforcement is used, every read and write query must include the
  session owner id.
- In either approach, tests must prove one user cannot read another user's
  history, watchlist, or alert preferences.

### Local Data Privacy

Current local-only data:

- Historial local in `polysignal-analysis-history-v1`;
- Mi lista local in `polysignal-local-watchlist-v1`;
- browser preferences such as theme.

Current controls:

- `/history` explains the data is stored in this browser;
- `/history` can clear local analysis history;
- `/watchlist` explains the data is stored in this browser;
- `/watchlist` can clear local saved markets;
- corrupt localStorage is cleared defensively instead of breaking public pages.

Before login exists, these local records must not be described as synced,
backed up, or account-owned. After login exists, the app should ask before
uploading local records to the account.

### External Research Controls

The external research layer is currently a model and readiness UI only. Before
real source calls are enabled:

- run all research from backend/server jobs, not browser fetches;
- use allowlisted hosts only;
- enforce rate limits and timeouts;
- cache responses to control cost and abuse;
- do not scrape aggressively;
- do not store raw HTML or raw third-party payloads;
- do not log secrets, API keys, private URLs, or tokens;
- treat social sources as low reliability by default;
- keep evidence separate from PolySignal estimates;
- do not generate a percentage unless the estimator has sufficient real
  evidence and calibration.

See `docs/external-research-plan.md` for the implementation roadmap.

### Analyzer-First Controls

The link analyzer is the main product flow and must stay Polymarket-first.

- Resolve submitted links through the safe `/api/analyze-polymarket-link`
  route and allowlisted Polymarket/Gamma/CLOB sources.
- Do not use internally loaded sports markets, `/sports/soccer`, or
  `/markets/overview` as the primary match source.
- If the source cannot return the market, show a no-match state instead of a
  cross-sport fallback.
- Store local history summaries only after the user chooses to save.
- Do not store raw resolver payloads or full wallet addresses.
- Do not count pending, cancelled, unknown or no-clear-decision records as
  failures.
