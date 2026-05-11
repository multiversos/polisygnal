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
- A value is treated as a PolySignal estimate only when it has independent
  evidence or a meaningful model edge. A market-price mirror is labelled as
  market probability only.
- The conservative estimate engine v0 returns `available=false` unless those
  independent signals already exist. It does not synthesize a new percentage.
- For soccer, the page can now extract match context from already-loaded event
  data: teams, date, sport, and missing categories. This context improves data
  preparation but does not create a PolySignal probability.
- `Preparacion de datos` is a non-predictive readiness score. It must never be
  shown as probability of a team winning.
- If the PolySignal estimate is missing, the page says that instead of
  defaulting to 50/50 or inventing a number.
- The page shows whether PolySignal has a clear decision. The current threshold
  is `55%`: YES `>= 55%` means clear YES, NO `>= 55%` means clear NO, and the
  45/55 zone is treated as no strong decision.
- Market price probability is reference context only. It does not create
  `predicted_side`.
- Market price probability must never be copied into
  `polysignal_probability_yes` or presented as `Estimacion PolySignal`.
- Saved link analyses can later be checked from `/history` with `Actualizar
  resultados`. This is automatic and does not ask the user to choose the final
  outcome manually.

This phase does not scrape Polymarket, does not write to Neon, and does not
invent probabilities. For result verification only, Historial can use a
server-side read-only adapter that validates Polymarket identifiers and calls
Gamma's structured `/events?slug=...` endpoint with an allow-list, timeout, no
cookies, no credentials, no dangerous redirects, and no raw payload returned to
the browser.

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
- Add team form, injuries, suspensions, schedule context, ratings/ELO/xG, and
  comparable sport stats before generating a new estimate.
- Treat Reddit and social discussion as weak/contextual signals only.
- Store sources and timestamps.
- Separate market probability from PolySignal probability.

## Phase 4: PolySignal Probability

Not implemented yet.

- Estimate YES/NO probability only when sufficient data exists.
- Use the readiness helpers from `estimationSignals.ts` and return unavailable
  when independent signals are missing.
- Explain confidence and data gaps.
- Compare PolySignal probability with the visible market price.
- Avoid language that implies guaranteed outcomes.

## Phase 5: Resolution And Calibration

Partially implemented locally, backend version not implemented yet.

- Verify final outcome after markets close from a reliable read-only source.
- Mark each saved analysis as hit, miss, cancelled, pending, or unknown without
  manual YES/NO buttons.
- Mark hit/miss only when the saved record had a clear PolySignal predicted
  side and the final outcome is verified.
- Calibrate accuracy over time by sport, confidence band, and market type.
- Compare market probability vs PolySignal probability only when both were
  recorded from real data.
- Show performance charts only from finalized records.

The current local version checks PolySignal's already-loaded market data and
read-only outcome data first. If those are stale, it can call
`/api/resolve-polymarket`, which queries Gamma by event slug and then matches by
market id or market slug. If there is no reliable outcome yet, the analysis
stays pending or unknown. The future backend version should run this
periodically, persist results per user, and record `resolved_at`,
`resolution_source`, and `resolution_reason` for auditability.

## Product Rules

- No fake results.
- No fake percentages.
- No market-price fallback for PolySignal estimates.
- No promise of profit.
- No "safe bet" language.
- Pending records do not count as misses.
- Unknown records do not count as misses.
- Cancelled records do not count as misses.
- Weak/no-estimate records do not count as misses.
- Only clear PolySignal predictions above the 55% threshold count once resolved.
- Do not ask users to manually mark YES/NO as the main resolution path.
- Every saved record must keep the analysis time and visible market price when
  available.
