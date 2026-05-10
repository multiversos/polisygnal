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

The current goal is product validation:

- users can save an analysis from `/markets/[id]`;
- `/history` shows saved analyses from this browser;
- accuracy is calculated only from saved records that have a real finalized
  result;
- pending and unknown records do not count as misses;
- the UI does not invent percentages when there are not enough finalized
  results.

## Future Link Analyzer Flow

Not implemented yet.

1. User pastes a Polymarket link.
2. PolySignal identifies the market and loads the matching market data.
3. PolySignal calculates an estimated probability only when enough real data is
   available.
4. The analysis is saved to history.
5. When the market closes, the final outcome is recorded.
6. The history page compares the original analysis with the final result.

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
- `predicted_side`
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
- Do not report an accuracy rate when there are no finalized hit/miss records.
- Do not promise profit, certainty, or betting advice.
- Do not activate automatic trading or scheduled refresh from this flow.
