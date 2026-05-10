# Link Analyzer Roadmap

## Phase 1: Current Local Experience

Implemented as a frontend-only flow.

- User opens `/analyze`.
- User pastes a Polymarket link.
- PolySignal validates that the link belongs to `polymarket.com`.
- PolySignal compares the link against markets already loaded in the app.
- If there is a match, the page shows existing market data only.
- If there is no match, the page says so honestly.
- User can save the result to local Historial.
- If a matched market has visible YES/NO prices, the page shows the implied
  market probability from those prices.
- If a PolySignal estimate already exists in the loaded data, the page shows it
  separately from the market probability.
- If the PolySignal estimate is missing, the page says that instead of
  defaulting to 50/50 or inventing a number.

This phase does not scrape Polymarket, does not call new external APIs, does not
write to Neon, and does not invent probabilities.

## Phase 2: Backend Market Lookup

Not implemented yet.

- Resolve Polymarket event/market identifiers server-side.
- Load market title, close time, outcomes, prices, volume, and liquidity.
- Store analysis records persistently instead of only in browser storage.
- Preserve the price and timestamp from the moment of analysis.
- Keep market price probability and PolySignal probability as separate fields.

## Phase 3: Evidence Search

Not implemented yet.

- Collect official sports data, team news, and relevant public sources.
- Treat Reddit and social discussion as weak/contextual signals only.
- Store sources and timestamps.
- Separate market probability from PolySignal probability.

## Phase 4: PolySignal Probability

Not implemented yet.

- Estimate YES/NO probability only when sufficient data exists.
- Explain confidence and data gaps.
- Compare PolySignal probability with the visible market price.
- Avoid language that implies guaranteed outcomes.

## Phase 5: Resolution And Calibration

Not implemented yet.

- Record final outcome after markets close.
- Mark each saved analysis as hit, miss, cancelled, pending, or unknown.
- Calibrate accuracy over time by sport, confidence band, and market type.
- Compare market probability vs PolySignal probability only when both were
  recorded from real data.
- Show performance charts only from finalized records.

## Product Rules

- No fake results.
- No fake percentages.
- No promise of profit.
- No "safe bet" language.
- Pending records do not count as misses.
- Unknown records do not count as misses.
- Every saved record must keep the analysis time and visible market price when
  available.
