# PolySignal Customer Data Architecture

Last updated: 2026-05-10

This document describes the customer-data boundary for PolySignal. Most
user-specific data is still local-only. The one new exception is a global public
registry of highlighted Polymarket wallet profiles; it is not user-specific and
does not create accounts, ownership, or private customer storage.

## Current Persistent Public Registry

`highlighted_wallet_profiles` stores public wallet profiles that meet the
highlighted profile criteria from Wallet Intelligence:

- real `winRate >= 80%`;
- `closedMarkets >= 50`;
- real PnL available, or observed public capital of at least `100 USD`;
- valid full public wallet address (`0x` + 40 hex).

This registry is global and public-product data, not a private saved list. It
stores only public Polymarket/Wallet Intelligence fields such as wallet address,
public profile URL, public pseudonym/avatar if the source returns it, real
closed-market counts, wins/losses, real PnL if available, observed capital,
compact public market history, warnings and limitations.

It must not store:

- private user identity;
- authenticated user preferences;
- service-role keys, tokens or connection strings;
- raw Polymarket payloads or complete wallet dumps;
- invented win rate, PnL, ROI, markets or history.

Because no auth/owner_id model exists, `/profiles` reads the global registry and
uses localStorage only for fallback, migration state and local hiding. Removing
a persistent profile means "hide in this browser"; global delete/admin actions
require a future authenticated admin model.

## Current Local User Data Audit

PolySignal currently stores user-specific product data only in the browser.

### Analysis History

Current helper:

- `apps/web/app/lib/analysisHistory.ts`

Current storage key:

- `polysignal-analysis-history-v1`

Current pages that read or write it:

- `/history`
- `/analyze`
- `/markets/[id]`

Current fields:

- `id`
- `marketId`
- `url`
- `title`
- `sport`
- `analyzedAt`
- `marketYesProbability`
- `marketNoProbability`
- `polySignalYesProbability`
- `polySignalNoProbability`
- `predictedSide`
- `confidence`
- `status`
- `outcome`
- `result`
- `reasons`
- `source`

Notes:

- The current data is local to one browser.
- Corrupt JSON is handled defensively by clearing the local key instead of
  breaking the page.
- Accuracy metrics only count resolved items. Pending and unknown records are
  not counted as misses.
- The current local history may include links pasted by the user, market titles,
  probability values available at save time, and user-selected saved records.

### Watchlist

Current helper:

- `apps/web/app/lib/watchlist.ts`

Current storage key:

- `polysignal-local-watchlist-v1`

Current pages that read or write it:

- `/watchlist`
- `/alerts`
- `/sports/soccer`
- `/markets/[id]`
- `/analyze`
- `/`

Current fields:

- `id`
- `market_id`
- `market_question`
- `market_slug`
- `sport`
- `status`
- `note`
- `market_shape`
- `close_time`
- `active`
- `closed`
- `latest_yes_price`
- `latest_no_price`
- `liquidity`
- `volume`
- `created_at`
- `updated_at`

Notes:

- The current watchlist is local to one browser.
- Corrupt JSON is handled defensively by clearing the local key.
- `/alerts` derives basic reminders from this local watchlist and visible
  market data.

### Local Data Sensitivity

Current local data is not account data yet, but it can still be user-sensitive:

- analyzed URLs can reveal user research interests;
- watchlist items can reveal markets the user follows;
- timestamps can reveal usage patterns;
- manually saved titles or future notes could contain personal context.

Data that can stay local before login:

- anonymous watchlist;
- anonymous analysis history;
- theme preference;
- local dismissed UI states.

Data that should move to backend only after login exists:

- account-synced analysis history;
- account-synced watchlist;
- alert preferences;
- user notification settings;
- subscription state;
- support and audit events.

LocalStorage risks:

- data is lost when the browser profile is cleared;
- data is not synced between devices;
- data can be changed by the local user or browser extensions;
- data is not ideal for long-term customer records;
- local records should not be treated as trusted evidence for billing, scoring,
  compliance, or official performance claims.

## Future Data Model

The following tables are proposed for a future authenticated product. They are
not implemented yet.

### `profiles`

Suggested fields:

- `id`
- `email`
- `display_name`
- `role` (`user` or `admin`)
- `created_at`
- `updated_at`

Rules:

- `id` should match the authenticated user id.
- `email` should be unique.
- `role` must default to `user`.
- Admin role changes must be audited.

### `user_analysis_history`

Suggested fields:

- `id`
- `owner_id`
- `market_id`
- `market_url`
- `title`
- `sport`
- `analyzed_at`
- `market_yes_probability`
- `market_no_probability`
- `polysignal_yes_probability`
- `polysignal_no_probability`
- `predicted_side`
- `confidence`
- `status`
- `outcome`
- `result`
- `reasons`
- `source`
- `created_at`
- `updated_at`

Rules:

- `owner_id` is required.
- Index `owner_id`.
- Index `market_id`.
- Consider a dedupe index on `(owner_id, market_id, source)` where safe.
- Limit URL and title lengths.
- Store `reasons` as controlled JSON or move to a separate table if the shape
  grows.
- Do not store external HTML, raw scraped pages, secrets, or unbounded payloads.
- Do not trust local `predicted_side` during import; recompute or validate it
  from stored probability fields.

### `user_watchlist`

Suggested fields:

- `id`
- `owner_id`
- `market_id`
- `title`
- `sport`
- `status`
- `created_at`
- `updated_at`

Rules:

- `owner_id` is required.
- Index `owner_id`.
- Index `market_id`.
- Use a unique constraint on `(owner_id, market_id)` to avoid duplicates.
- Do not store raw HTML or unbounded notes.

### `user_alert_preferences`

Suggested fields:

- `id`
- `owner_id`
- `market_id`
- `alert_type`
- `enabled`
- `created_at`
- `updated_at`

Rules:

- `owner_id` is required.
- Index `owner_id`.
- Index `market_id`.
- Alerts should be preferences, not a promise of real-time delivery until the
  notification system exists.

### `audit_log`

Suggested fields:

- `id`
- `actor_id`
- `action`
- `entity_type`
- `entity_id`
- `created_at`
- `metadata_redacted`

Rules:

- Audit admin and support actions.
- Store redacted metadata only.
- Do not store tokens, full connection strings, payment secrets, or private
  customer notes.

## Access Control Model

Normal user:

- can read and write only their own `user_analysis_history` rows;
- can read and write only their own `user_watchlist` rows;
- can read and write only their own `user_alert_preferences` rows;
- cannot set `owner_id` through the client payload.

Admin:

- can view aggregate product metrics;
- should not view individual user history unless there is an authorized support
  reason;
- every admin support action must be written to `audit_log`;
- admin role assignment must be a controlled operation.

Service role:

- never exposed to frontend bundles;
- only used in backend jobs, server-side actions, or carefully scoped
  operational scripts;
- must not be printed in logs.

API rules:

- derive `owner_id` from the authenticated session, never from request body;
- ignore or reject client-supplied `owner_id`;
- validate URL length, title length, enum values, and probability ranges;
- sanitize string fields and never render user strings as raw HTML;
- return generic errors to the browser and keep internal details in safe logs.

RLS or backend permissions:

- If using Postgres RLS, add policies that compare `owner_id` to the current
  authenticated user id.
- If enforcing through the backend, every query must include `owner_id` from the
  session and never trust the client.
- In either model, write tests proving one user cannot read another user's
  history, watchlist, or alert preferences.

Logging:

- avoid printing full emails unless needed for support;
- redact URL query tokens;
- do not log session tokens, service-role credentials, API keys, or payment
  artifacts;
- keep admin support access auditable.

## Local-To-Account Migration Plan

Phase 0: anonymous use

- Historial and Mi lista stay in localStorage.
- UI explains that data is saved only in this browser.
- Users can clear local history and watchlist.

Phase 1: account creation

- After login/signup, ask whether the user wants to import local data.
- Explain what will be uploaded: watched markets, saved analyses, timestamps,
  and pasted Polymarket links.
- Provide a skip option.

Phase 2: validation before import

- Validate the localStorage shape against known fields.
- Limit the number of imported items.
- Limit title and URL lengths.
- Reject unknown enum values.
- Reject HTML payloads and unrecognized complex objects.
- Do not trust local `predictedSide`; derive it from validated PolySignal
  probability fields if those fields exist.

Phase 3: dedupe and ownership

- Assign `owner_id` from the session on the server.
- Dedupe watchlist by `(owner_id, market_id)`.
- Dedupe history by `(owner_id, market_id/url, analyzed_at/source)` where
  practical.
- If the same market already exists, keep the most recent user-facing record or
  merge non-conflicting fields.

Phase 4: after import

- Ask whether to keep or clear the local copy.
- If kept, mark future UI as account-synced when backend sync exists.
- If cleared, remove only the known PolySignal localStorage keys.

Security constraints:

- no raw HTML import;
- no service-role keys in frontend;
- no client-supplied `owner_id`;
- no payment data in these flows;
- no performance claims based only on imported local records.

## Current Integration Points

Frontend helpers:

- `apps/web/app/lib/analysisHistory.ts`
- `apps/web/app/lib/watchlist.ts`
- `apps/web/app/lib/customerDataTypes.ts`

Frontend routes:

- `/history`
- `/watchlist`
- `/alerts`
- `/analyze`
- `/markets/[id]`

Future backend work should start with a schema draft and tests only after the
auth provider and ownership enforcement model are approved.
