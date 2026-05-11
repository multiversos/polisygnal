# Wallet Intelligence Plan

## Purpose

Wallet Intelligence is a future auxiliary signal for the PolySignal link
analyzer. It should help answer a narrow question:

> Are public wallets with meaningful market activity leaning YES, NO, or neither?

It must not identify real people, encourage copy-trading, promise gains, or
create a PolySignal estimate by itself.

## Current Repo Audit

Existing structured wallet-related code was found in the backend:

- `apps/api/app/clients/polymarket_data.py`
  - public Polymarket Data API client;
  - `get_trades_for_market(condition_id)`;
  - `get_trades_for_user(wallet)`;
  - `get_user_positions(wallet)`;
  - `get_user_closed_positions(wallet)`;
  - `get_positions_for_market(condition_id)`;
  - `get_leaderboard(...)`;
  - `get_user_profile(wallet)`.
- `apps/api/app/services/wallet_intelligence.py`
  - builds a read-only wallet summary for a market;
  - resolves `condition_id` from stored market metadata or Gamma;
  - filters large trades/positions;
  - abbreviates wallet addresses;
  - returns concentration by side when available.
- `apps/api/app/schemas/wallet_intelligence.py`
  - response schemas for trades, positions, notable wallets and concentration.
- `apps/api/app/api/routes.py`
  - exposes `GET /markets/{market_id}/wallet-intelligence`.

No frontend wallet intelligence is connected to `/analyze` yet. The new web
helpers are conservative and return unavailable unless real structured wallet
data is passed in.

## Data Available Today

Potentially available from existing backend code when the read-only endpoint is
called:

- wallet address;
- shortened wallet address;
- market `condition_id`;
- trade side/action;
- outcome/side label when present;
- trade size estimate in USD;
- position current value / total bought;
- average/current price;
- realized or total PnL when the public source provides it;
- timestamp;
- concentration by side.

Current limitations:

- PnL fields may be incomplete and should not be treated as complete ROI.
- Win rate requires resolved historical positions and outcome matching.
- A public profile or pseudonym is not a real-world identity.
- The endpoint should remain read-only and bounded.

## Identifiers Needed

Useful identifiers for real integration:

- internal `marketId`;
- Polymarket `conditionId`;
- CLOB token IDs for YES/NO;
- `eventSlug`;
- `marketSlug`;
- wallet address, handled as public pseudonymous data.

## Threshold

Frontend readiness helpers use a planned default threshold:

- `100 USD` minimum position/trade size.

Rules:

- wallets below the threshold are ignored;
- threshold filtering must happen before summaries are displayed;
- if no wallet crosses the threshold, the signal is unavailable;
- the threshold is not a confidence score.

## Metrics Planned

Future metrics should be computed only from real structured public data:

- relevant wallets count;
- capital leaning YES;
- capital leaning NO;
- trusted YES wallets;
- trusted NO wallets;
- market participation count;
- resolved market count;
- wins/losses;
- win rate;
- estimated ROI;
- total volume;
- average position size;
- category specialization;
- consistency/risk profile.

If any metric cannot be computed from reliable data, it must stay hidden or
marked unavailable. Do not backfill with estimates.

## Privacy And Safety

Rules:

- show shortened addresses by default;
- never attempt to identify the person behind a wallet;
- do not display private notes, emails, names, or inferred identity;
- do not encourage copying a trader;
- do not call a wallet "smart money" unless the label is backed by explicit,
  documented criteria;
- do not promise profit or certainty;
- do not store raw payloads or complete wallet histories until a customer data
  model, retention policy, and rate limiting are approved.

## Product Use

Wallet Intelligence can become one input in `collectIndependentSignals` only
when real wallet data exists. It should be marked:

- `source: wallet_intelligence`;
- `isIndependent: true`;
- direction YES/NO/NEUTRAL/UNKNOWN from real position bias;
- low confidence when few wallets are available;
- neutral when reliable wallets are split.

It must not:

- create a PolySignal probability by itself;
- create `predictedSide` by itself;
- override market resolution;
- count as hit/miss without a separate clear PolySignal estimate and verified
  outcome.

## Implementation Path

1. Keep the frontend scaffold read-only and unavailable by default.
2. Add tests that verify no fake wallets, ROI, win rate or full addresses are
   emitted without real data.
3. Decide whether `/analyze` should call a server-side endpoint after rate
   limits exist.
4. Add allowlists, timeout, response-size caps, and no-store behavior before
   any new wallet lookup route is exposed.
5. Cache only minimal summaries, not raw wallet payloads.
6. Add documentation for retention and deletion before storing any customer or
   wallet-derived history.

## Not In This Sprint

- No new external calls from `/analyze`.
- No scraping.
- No database writes.
- No wallet storage.
- No new tables or migrations.
- No ROI/win-rate calculation without real closed-position data.
- No prediction generation from wallet data.
