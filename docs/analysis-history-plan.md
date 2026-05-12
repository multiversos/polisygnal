# Analysis History Roadmap

## Current Phase

The public `Historial` page is a local browser experience. It uses
`localStorage` to save analyses from market detail pages and to calculate
summary statistics. It does not write to Neon, does not create backend tables,
and does not run scoring, imports, trading, or migrations.

The public `/analyze` page can also save records into Historial. In the current
phase it only validates Polymarket links and compares them with markets already
loaded in PolySignal. It does not fetch external Polymarket pages or create new
market records.

`/analyze` now builds a unified `AnalyzerResult` before rendering and before
saving matched analyses. The saved local record can include a sanitized layer
summary:

- market detected;
- market probability;
- PolySignal estimate availability;
- event context;
- research readiness;
- Wallet Intelligence summary;
- related history;
- result/resolution status.

This metadata is stored only in localStorage for the current browser. Wallet
metadata is aggregate-only: relevant wallet count, observed capital, YES/NO
capital when available, threshold, confidence, reason, source, and warnings. It
does not store raw wallet payloads or complete wallet addresses.

The link analyzer now requires confirmation before deep analysis. A pasted
Polymarket link is first detected and ranked; if it maps to an event with
multiple markets, the user selects one market. Only that selected market can be
saved as a full analysis record. Compact secondary candidates do not create
history records unless the user explicitly selects them.

When a matched market has visible YES/NO prices, `/analyze` stores the implied
market probability from those prices. If a PolySignal estimate already exists
in the loaded data, it is stored separately as the PolySignal estimate. If that
estimate is missing, the history record must remain clear about the gap instead
of filling in a default probability.

PolySignal now applies an estimate-quality gate before showing or saving
PolySignal YES/NO values. If the available value only mirrors the visible
market price, it is treated as `market_price_only`, hidden from the PolySignal
estimate fields, and does not create a predicted side.

The conservative estimate engine v0 is now represented in frontend helpers. It
collects market signals and independent signals, then returns `available=false`
unless a real PolySignal estimate already exists. This is intentional: v0 is a
readiness layer, not a heuristic estimator.

Deep Analyzer readiness is now prepared as a compact contract for future saved
records. Until the backend engine exists, local history should store only layer
summaries and sanitized wallet aggregates. It must not store fake research,
fake odds, fake Kalshi comparisons, fake wallet profiles, or a decision created
from market price. A saved Deep Analyzer v0 record remains no-clear-decision
unless a real PolySignal estimate exists.

## Clear Prediction Rule

PolySignal only creates a measurable `predicted_side` from a real PolySignal
estimate. The visible market price is saved as reference, but it never creates a
PolySignal prediction.

Initial rule:

- PolySignal YES `>= 55%`: `predicted_side = YES`, decision `clear`.
- PolySignal NO `>= 55%`: `predicted_side = NO`, decision `clear`.
- YES and NO inside the `45%` to `55%` zone: decision `weak`, no measurable
  predicted side.
- Missing PolySignal estimate: decision `none`, no measurable predicted side.
- Market-price-only records: decision `none`, no measurable predicted side.
- Pending, cancelled, unknown, and weak/no-estimate records do not count as
  failures.

Accuracy is calculated only when a record had a clear PolySignal prediction and
the final outcome came from Polymarket or another structured trusted source.

The current goal is product validation:

- users can save an analysis from `/markets/[id]`;
- `/history` shows saved analyses from this browser;
- saved link analyses can show market probability and PolySignal probability
  as two different concepts;
- accuracy is calculated only from saved records that had a clear PolySignal
  prediction and a real finalized result;
- pending, cancelled, weak, no-estimate, and unknown records do not count as
  misses;
- the UI does not invent percentages when there are not enough finalized
  results.

## Automatic Resolution In Local History

The current local Historial now has a read-only `Actualizar resultados` action.
It does not ask the user to mark whether YES or NO won. Instead, it tries to
verify saved analyses automatically:

1. If a saved item has `market_id`, PolySignal first checks the read-only
   outcome data already available through the existing app.
   Outcome rows whose source is manual are ignored for Historial resolution;
   they are not used as the main strategy.
2. If no outcome is available, it checks the loaded market detail/overview data
   to see whether the market is still open or appears closed without a reliable
   result.
3. If the item only has a URL, PolySignal extracts the slug and searches the
   already-loaded market overview for a strong match.
4. If those sources do not resolve the item, the web app can call the
   server-side read-only route `/api/resolve-polymarket`. That route validates
   the Polymarket input and queries Gamma's structured `/events?slug=...`
   endpoint. It does not proxy arbitrary URLs.
5. If the market is still open, the item remains `pending`.
6. If the market has a reliable YES/NO outcome and the item has a clear saved
   PolySignal `predicted_side`, the result becomes `hit` or `miss`.
7. If the market has a reliable YES/NO outcome but no clear saved PolySignal
   side, the result becomes `unknown` because there is nothing honest to compare.
8. If the market is cancelled/invalid, the result becomes `cancelled`.
9. If PolySignal cannot verify the result, the item remains `unknown` or
   pending rather than inventing an outcome.

This is still localStorage-only. It does not create tables, does not write to
Neon, does not scrape Polymarket HTML, and does not run scoring. External
resolution is limited to a structured, allow-listed Gamma request with a short
timeout, no cookies, no credentials, no redirects, no raw payload returned to
the browser, and conservative outcome parsing. A future backend job should
replace this with periodic read-only checks against verified structured
Polymarket/Gamma/CLOB sources.

## Future Link Analyzer Flow

Partially implemented locally.

1. User pastes a Polymarket link.
2. PolySignal identifies the market and loads the matching market data.
3. PolySignal calculates an estimated probability only when enough real data is
   available.
4. The analysis is saved to history.
5. When the market closes, the final outcome is verified automatically when a
   reliable source is available.
6. The history page compares the original analysis with the final result.

Resolution lifecycle planned for a future backend phase:

1. Detect that the market is closed.
2. Read the final outcome.
3. Mark the saved analysis as `hit`, `miss`, `pending`, `unknown`, or
   `cancelled`.
4. Recalculate accuracy and calibration only from finalized records.
5. Keep pending and unknown records out of hit/miss totals.

## Fields Needed Later

- `market_url`
- `market_id`
- `title`
- `sport`
- `analyzed_at`
- `market_price_yes`
- `market_price_no`
- `polysignal_probability_yes`
- `polysignal_probability_no`
- `decision`
- `decision_threshold`
- `predicted_side`
- `evaluation_status`
- `evaluation_reason`
- `analyzer_layers` (local summary only)
- `wallet_intelligence_summary` (aggregate, no full addresses)
- `remote_id`
- `condition_id`
- `event_slug`
- `market_slug`
- `confidence`
- `signals_used`
- `estimate_quality`
- `estimator_version`
- `final_outcome`
- `resolved_at`
- `result`
- `reasons`
- `source`

## Future Database Shape

When the local experience is validated, move the records into backend storage.
Possible tables:

- `analyzed_markets`
- `analysis_snapshots`
- `analysis_results`

That future migration must be reviewed separately, include tests, and run only
after a safe dry-run/approval flow. The current phase intentionally avoids new
tables and production writes.

## Safety Rules

- Do not show demo history as real performance.
- Do not count pending records as failures.
- Do not count unknown records as failures.
- Do not report an accuracy rate when there are no finalized hit/miss records.
- Do not mix market probability with PolySignal probability.
- Do not show a PolySignal estimate unless there is independent evidence or a
  meaningful model edge.
- Preserve the market price and analysis time when they are available.
- Do not promise profit, certainty, or betting advice.
- Do not activate automatic trading or scheduled refresh from this flow.

## Analyzer-First History Role

History is now the measurement system for the product, not just a saved list.

Primary responsibilities:

- Store analyses created from `/analyze`.
- Keep normalized Polymarket URL, event slug, market slug, ids, prices,
  decision metadata, safe wallet summary and analyzer layer summaries.
- Store local Deep Analyzer job metadata when an analysis is waiting for
  Samantha or evidence scoring:
  - `deepAnalysisJobId`
  - `awaitingResearch`
  - `researchStatus`
- Track lifecycle fields locally:
  - `trackingStatus`
  - `lastCheckedAt`
  - `nextCheckHint`
  - `resolutionStatus`
- Provide the input for `/performance`.
- Let the user reanalyze the original link.
- Let the user continue a pending deep research job from `/history`.
- Let the user run a manual result refresh while there is no persistent backend
  job.

Accuracy remains strict:

- `accuracy = hits / (hits + misses)`
- pending, cancelled, unknown and no-clear-decision records do not count.
- market-price-only records do not count.
- the user does not manually decide hit/miss.

Deep research status:

- `awaiting_samantha` means the brief is ready and PolySignal is waiting for a
  structured report.
- `ready_to_score` means a report was valid and produced signals, but the
  evidence did not pass the decision gate.
- Neither state counts as hit, miss, accuracy, or a PolySignal prediction.
- The CTA is `Continuar analisis`, not manual result editing.
