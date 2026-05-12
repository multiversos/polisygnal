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

The frontend adapter is now connected read-only through the existing same-origin
backend proxy. `/analyze` may request a bounded summary for matched local
`marketId` values and stores only sanitized summary fields in component state.
The adapter does not expose raw payloads, does not keep full wallet addresses in
its public summary, and returns unavailable on any lookup failure.

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
- Backend payloads can include full public wallet addresses, so public UI must
  render `wallet_short` only. The frontend adapter redacts by keeping
  `walletAddress` equal to the shortened display value.

## Read-Only Endpoint Probe

Production was probed with `GET /markets/{market_id}/wallet-intelligence` using
`min_usd=100` and a small limit. The report was redacted before documenting.

Observed shape:

- `data_available`;
- `threshold_usd`;
- `large_trades`;
- `large_positions`;
- `notable_wallets`;
- `concentration_summary.sides`;
- `warnings`;
- `generated_at`.

Observed data:

- some soccer market IDs returned `data_available=true`;
- `large_positions` can include shortened wallet address, side/outcome, position
  size USD, average/current price, and PnL fields when the public source returns
  them;
- `large_trades` can include shortened wallet address, side/outcome, trade size
  USD, price, timestamp, and action fields;
- `amount USD` and YES/NO side are available for some markets;
- `win rate`, `estimated ROI`, and resolved historical performance are not
  returned as complete, reliable metrics today.

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

## Public Readout

The public UI now converts the sanitized endpoint summary into a product-facing
readout:

- `Capital observado inclinado hacia YES`;
- `Capital observado inclinado hacia NO`;
- `Billeteras relevantes divididas`;
- `Datos de billeteras insuficientes`;
- `Confianza baja/media/alta`, with low as the default unless reliable
  historical performance exists.

This readout uses only fields already returned by the read-only endpoint:
`large_trades`, `large_positions`, `notable_wallets`,
`concentration_summary`, `threshold_usd`, `warnings`, `generated_at`, side,
amount USD, prices, and PnL fields only when the public source provides them.

Public copy must always say Wallet Intelligence is an auxiliary signal. It must
not call a wallet "smart", imply inside knowledge, identify real people, or
recommend copying operations.

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

In `/analyze`, Wallet Intelligence is now one layer of the unified analyzer
result. The page can show:

- whether wallet data is available;
- the `$100+` threshold;
- relevant wallet count;
- observed capital;
- YES/NO/Neutral bias when the endpoint provides side and amount;
- confidence, usually low until historical wallet performance exists;
- warnings that the signal is auxiliary and does not identify people.

When the analysis is saved to local Historial, only the sanitized aggregate
summary is stored. Top wallet rows are not saved in history metadata; public UI
uses shortened addresses only when showing current endpoint results.

Wallet Intelligence is scoped to the selected analyzer market. It is not fetched
for every possible match in the confirmation selector, which keeps the link
flow quiet and avoids implying that secondary candidates were fully analyzed.

In the Deep Analyzer contract, Wallet Intelligence is an auxiliary layer. If it
has real read-only data it can contribute a real low-confidence signal with
direction YES/NO/Neutral, but `WalletProfileAnalyzer` remains blocked until
closed-position history, win rate and ROI can be computed from reliable public
data. Wallet data alone must not create a PolySignal decision.

It must not:

- create a PolySignal probability by itself;
- create `predictedSide` by itself;
- override market resolution;
- count as hit/miss without a separate clear PolySignal estimate and verified
  outcome.

## Implementation Path

1. Keep the frontend integration read-only and bounded through the backend
   proxy.
2. Add tests that verify no fake wallets, ROI, win rate or full addresses are
   emitted without real data.
3. Keep `/analyze` display limited to shortened addresses, amount, side,
   aggregate capital, bias, and safety warnings.
4. Add stronger rate limits before expanding volume or adding new wallet lookup
   routes.
5. Cache only minimal summaries, not raw wallet payloads.
6. Add documentation for retention and deletion before storing any customer or
   wallet-derived history.

## Not In This Sprint

- No new external source beyond the existing read-only backend endpoint.
- No scraping.
- No database writes.
- No wallet storage.
- No new tables or migrations.
- No ROI/win-rate calculation without real closed-position data.
- No prediction generation from wallet data.

## Analyzer-First Scope

Wallet Intelligence is now part of the selected `/analyze` report only.

- It runs after a Polymarket link has been resolved and the user selected one
  market.
- It must use the resolved Polymarket-compatible id when available.
- It must not use internal sports matches as fallback for another market.
- It can be saved to History only as a sanitized aggregate summary.
- It remains an auxiliary signal and never creates a PolySignal prediction by
  itself.
