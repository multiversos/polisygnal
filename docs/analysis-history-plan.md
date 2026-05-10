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

When a matched market has visible YES/NO prices, `/analyze` stores the implied
market probability from those prices. If a PolySignal estimate already exists
in the loaded data, it is stored separately as the PolySignal estimate. If that
estimate is missing, the history record must remain clear about the gap instead
of filling in a default probability.

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
4. If the market is still open, the item remains `pending`.
5. If the market has a reliable YES/NO outcome and the item has a clear saved
   PolySignal `predicted_side`, the result becomes `hit` or `miss`.
6. If the market has a reliable YES/NO outcome but no clear saved PolySignal
   side, the result becomes `unknown` because there is nothing honest to compare.
7. If the market is cancelled/invalid, the result becomes `cancelled`.
8. If PolySignal cannot verify the result, the item remains `unknown` or
   pending rather than inventing an outcome.

This is still localStorage-only. It does not create tables, does not write to
Neon, does not scrape Polymarket HTML, and does not run scoring. The source is
limited to data PolySignal can already read safely. A future backend job should
replace this with periodic read-only checks against a verified structured
Polymarket source.

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
- `confidence`
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
- Preserve the market price and analysis time when they are available.
- Do not promise profit, certainty, or betting advice.
- Do not activate automatic trading or scheduled refresh from this flow.
