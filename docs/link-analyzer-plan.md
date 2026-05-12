# Link Analyzer Roadmap

## Phase 1: Current Local Experience

Implemented as a frontend-only flow.

- The public home page positions `/analyze` as the main product entry: paste a
  Polymarket link, confirm the market, save the reading, and measure it later
  from local history.
- User opens `/analyze`.
- User pastes a Polymarket link.
- The initial `/analyze` state explains `Detectar -> Confirmar -> Analizar` in
  plain language before any analysis runs.
- PolySignal validates that the link belongs to `polymarket.com`.
- PolySignal parses the link into locale, category, league/sport, raw slug,
  event slug, market slug, date, team-code hints, and secondary search terms.
- League prefixes from sports slugs, standalone years, standalone dates, and
  one-team matches are treated as weak context only. They must not create a
  primary match.
- PolySignal compares the exact slug and date/team context against markets
  already loaded in the app.
- Exact market slugs or exact local/remote ids isolate that single market in
  the selector. Exact event slugs can show sibling markets from the same event,
  but not unrelated matches from the same league or date.
- The user flow is `Detectar -> Confirmar -> Analizar -> Guardar -> Verificar
  resultado`.
- If there is a match, `/analyze` first shows a compact selector. It does not
  open deep analysis for every candidate.
- The selector is a confirmation step, not the final report. It labels exact,
  strong, and possible matches, shows a short reason, and asks the user to run
  `Analizar este mercado` before any deep layers load.
- If the link is an event with several markets, only markets from that same
  event are shown for selection.
- If there is no exact match, the page shows at most compact possible matches
  and says that no exact match was found.
- If there is no match, the page says so honestly and can save the link as
  pending without inventing market data.
- User can save the result to local Historial.
- The result is organized through `analyzerResult.ts`, a unified frontend model
  that records the link, normalized URL, match confidence, market id, decision
  state, accuracy eligibility, and reviewed analysis layers.
- The analyzer layers are:
  - `market`: detected market, title, status and match confidence.
  - `probabilities`: market YES/NO probability from visible prices.
  - `polysignal_estimate`: real PolySignal estimate if one exists.
  - `event_context`: event or soccer match context from loaded data.
  - `research`: external research coverage or missing categories.
  - `wallet_intelligence`: sanitized read-only wallet summary.
  - `history`: related local history records.
  - `resolution`: verified result status when a trusted source is available.
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
- The page also shows external research readiness. If no real findings are
  loaded, it lists missing categories such as recent form, injuries, team news,
  external odds, advanced stats, and calibration.
- If the PolySignal estimate is missing, the page says that instead of
  defaulting to 50/50 or inventing a number.
- The page shows whether PolySignal has a clear decision. The current threshold
  is `55%`: YES `>= 55%` means clear YES, NO `>= 55%` means clear NO, and the
  45/55 zone is treated as no strong decision.
- Market price probability is reference context only. It does not create
  `predicted_side`.
- Market price probability must never be copied into
  `polysignal_probability_yes` or presented as `Estimacion PolySignal`.
- Wallet Intelligence can appear as an auxiliary layer when the read-only
  endpoint returns real sanitized data. It can improve readiness, but cannot
  create a PolySignal prediction by itself.
- Related local history is shown inside `/analyze` when the same market, URL,
  slug, or remote id was analyzed before. This helps users avoid accidental
  duplicate reads while still allowing a new dated analysis.
- Wallet Intelligence is fetched only after the user selects a market for deep
  analysis. It is not loaded for secondary candidates in the selector.
- After a market is selected, the result is rendered by `AnalyzerReport.tsx`.
  The report keeps a compact executive summary at the top, then groups deeper
  layers into collapsible sections instead of opening every block at once.
- The executive summary shows market probability, real PolySignal estimate
  availability, decision state, and whether the reading can count for accuracy
  later. It keeps the market price clearly separate from any PolySignal
  estimate.
- Advanced layers are grouped as context, data preparation, external research,
  Wallet Intelligence, related history, and result verification. Each layer has
  a one-line summary first, with details available on demand.
- Wallet Intelligence appears as a compact auxiliary signal. If real public
  wallet data exists, the report shows observed capital, YES/NO/Neutral bias,
  confidence, threshold `$100+`, and shortened wallet addresses behind a
  drilldown labelled `Ver todas las billeteras analizadas`.
- The report includes a compact data-sources row: market price from Polymarket,
  market/event data from Polymarket plus PolySignal, wallet data from public
  Polymarket/Gamma read-only sources when available, external research as pending or
  verified, and history from this browser.
- The report closes with `Que puedes hacer ahora`: save the analysis, save as
  follow-up when there is no PolySignal estimate, view history, follow the
  market, open market detail, or analyze another link.
- `/history` points users back to `/analyze` through its header, empty state,
  and `Reanalizar enlace` actions for saved records that include the original
  URL.
- QA cases currently protected:
  - `https://polymarket.com/es/sports/epl/epl-bri-wol-2026-05-09` shows a
    compact selector with markets from that same event.
  - `https://polymarket.com/market/epl-bri-wol-2026-05-09-bri` isolates the
    exact market slug before deep analysis.
  - `https://polymarket.com/es/sports/laliga/lal-cel-lev-2026-05-12` does not
    surface Sevilla/Espanyol, Atletico/Celta, or other one-team/league/date
    noise when that exact event is not loaded.
- The final copy should read like a responsible review:
  "PolySignal reviso las capas disponibles" and, when needed, "No hay evidencia
  suficiente para emitir una estimacion propia responsable."
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

- No screenshot flow.
- No OCR.
- No image upload.
- No fake results.
- No fake percentages.
- No fake markets, teams, dates, or prices.
- No market-price fallback for PolySignal estimates.
- No opening ten full analysis cards from one link.
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
