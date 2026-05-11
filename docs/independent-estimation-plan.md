# Independent Estimation Plan

## Current Purpose

PolySignal must keep market probability and PolySignal probability separate.
The visible Polymarket price can be useful context, but it is not a
PolySignal estimate and must not create `predictedSide`.

This plan documents what exists today, what is independent, and what is still
missing before PolySignal can produce durable sport estimates.

## Signal Audit

### Market Signals

Available today:

- YES/NO price from latest market snapshot.
- Volume and liquidity when Polymarket exposes them.
- Recent snapshot timestamp.
- Active/closed state.
- Price movement when price history has multiple snapshots.

Use:

- Good for context, freshness, and confidence support.
- Not independent of the market.
- Must not be copied into `polysignal_probability_yes`.

### PolySignal Signals

Available today:

- `latest_prediction` records when the pipeline has scored a market.
- `confidence_score`, `edge_signed`, `edge_magnitude`, `prediction_family`,
  `run_at`.
- `used_odds_count`, `used_news_count`, and
  `used_evidence_in_scoring` in overview summaries.
- Market detail can expose research runs, findings, reports, evidence items,
  external signals, freshness, and data quality.

Use:

- A prediction can be shown as PolySignal only when it passes the
  estimate-quality gate.
- A score that only mirrors Polymarket baseline is treated as
  `market_price_only`.
- A saved value without evidence is treated as `saved_without_evidence`.

### Independent Signals

Partially available today:

- Evidence counts in overview.
- Research/finding/report objects in market detail.
- External signal objects when already loaded.
- Odds/news counts that were used by scoring.

Missing or incomplete for a full real estimator:

- Team form and matchup stats.
- Injuries and suspensions.
- Official lineups and availability.
- Schedule congestion and travel context.
- Ratings/ELO/xG or comparable sport models.
- Cross-book odds references with legal/compliance review.
- Resolved-market calibration by sport and confidence band.

### Non-Independent Signals

These must never create a PolySignal estimate on their own:

- Polymarket YES/NO price.
- A score equal to the Polymarket price.
- A baseline derived only from Polymarket.
- Fallback 50/50.
- A saved local value without evidence metadata.

## Estimate Readiness

The frontend now has explicit readiness helpers:

- `collectMarketSignals`
- `collectIndependentSignals`
- `getEstimateReadiness`
- `getEstimateReadinessScore`
- `shouldAllowPolySignalEstimate`
- `explainMissingEstimateData`
- `extractSoccerMatchContext`

Rules:

- Market price can be collected as a signal with `isIndependent=false`.
- Volume and liquidity can support confidence but do not create a prediction.
- Soccer match context can be an independent neutral signal when teams or dates
  are identified from existing event data.
- Match context alone is still not enough to create a PolySignal probability.
- A clear `predictedSide` can exist only after a real PolySignal estimate
  exists and crosses the 55% threshold.

`Preparacion de datos` is a non-predictive 0-100 score. It indicates how much
input data exists for future analysis; it is not a probability of YES or NO.

## Conservative Engine V0

`polySignalEstimateEngine` intentionally does not invent a new number.

Behavior:

- If no independent signals exist: `available=false`.
- If only market price exists: `available=false`.
- If a real PolySignal estimate already exists and passes quality checks:
  `available=true` and the stored estimate is returned.
- If partial signals exist but are insufficient: `available=false`.
- If only soccer context exists, the engine may show partial readiness but still
  returns `available=false`.

This keeps the UI honest while preparing the future estimator API.

## Soccer Context Layer

The first sports-specific layer lives in `soccerMatchContext.ts`.

It extracts only from already-loaded fields:

- event title;
- market question;
- event/market slug as fallback context;
- sport type;
- close/end time.

It can identify `Team A vs Team B` from clear titles, but keeps home/away as
`unknown` unless a future structured source provides it. It does not infer league
from slug abbreviations.

## Future Sources

### Sports Data

- Recent form.
- Goals/points for and against.
- Home/away context.
- Injuries and suspensions.
- Rest days, travel, and calendar congestion.
- ELO, xG, or sport-specific ratings.

### News And Public Sources

- Official team and league sources.
- Reputable sports reports.
- Recent injury/team news.
- Reddit/social discussion only as weak context, never a primary source.

### Odds References

- Regulated sportsbook odds as comparison inputs where legally appropriate.
- Cross-market differences vs Polymarket.
- Compliance review before production use.

### Calibration

- Accuracy by sport.
- Accuracy by confidence band.
- Market-vs-PolySignal edge performance.
- Model drift and stale-data checks.

## Guardrails

- Do not estimate when data is insufficient.
- Do not promise profit.
- Show sources and missing data.
- Store analysis time, market price, signals used, and estimator version later.
- Keep external fetches rate-limited and allow-listed.
- Do not write production data without explicit supervised approval.
