# Link Analyzer Roadmap

## Analysis Agent Bridge

Actualizacion `2026-05-13`: despues de resolver un enlace y cargar Wallet
Intelligence, `/analyze` llama a `/api/analysis-agent/send-research`. Samantha
queda como proveedor inicial, pero la ruta y el helper son genericos. Para
cambiar a Jarvis u otro agente se configuran `ANALYSIS_AGENT_PROVIDER`,
`ANALYSIS_AGENT_ENABLED`, `ANALYSIS_AGENT_URL`, `ANALYSIS_AGENT_TOKEN` y
`ANALYSIS_AGENT_DISPLAY_NAME`; no se cambia `/analyze`.

Si el agente no esta desplegado o no hay envs en Vercel, la experiencia publica
mantiene fuente automatica no disponible/lectura parcial y no muestra JSON,
schema, carga manual ni instrucciones de reporte.

## Phase 1: Current Local Experience

Implemented as a frontend flow plus a same-origin read-only resolver route.

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
- The primary source for link resolution is now Polymarket/Gamma read-only, not
  markets already loaded inside PolySignal.
- `/api/analyze-polymarket-link` validates the submitted Polymarket URL, builds
  an allowlisted Gamma request internally, and returns normalized event/market
  data only. It is not an open proxy.
- Exact event links resolve through Gamma `/events?slug=...`; exact market links
  first try Gamma `/markets?slug=...`. If that structured market lookup returns
  empty but the dated market slug contains an event slug, the resolver queries
  that Gamma event and keeps only the exact requested market slug.
- If Gamma returns an event with several markets, the selector shows only those
  markets from that real event. Large event selectors stay compact with a
  local filter and a `Ver mas mercados` control.
- If Gamma cannot return the event or market, `/analyze` shows a no-match state:
  "No pudimos obtener este mercado desde Polymarket." It does not search
  internally for similar markets.
- The user flow is `Detectar -> Confirmar -> Analizar -> Guardar -> Verificar
  resultado`.
- The MVP continuity checklist lives in `docs/analyzer-mvp-test-flow.md`; it
  covers History continuation, Samantha `pending/manual_needed`, automatic
  partial readings, and the rule that research-pending analyses do not count for
  accuracy.
- If there is a match, `/analyze` first shows a compact selector. It does not
  open deep analysis for every candidate.
- The selector is a confirmation step, not the final report. It labels exact,
  strong, and possible matches, shows a short reason, and asks the user to run
  `Analizar este mercado` before any deep layers load.
- If the link is an event with several markets, only markets from that same
  event returned by Polymarket are shown for selection.
- If there is no structured match from Polymarket, the page says so honestly.
  It does not show possible matches from another sport or league.
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
- `polySignalSignalMixer.ts` now defines the conservative estimate gate for
  live link analyses. It requires: Polymarket market reference, validated
  Samantha report with accepted estimate, and at least one independent support
  from real wallet data, wallet profiles, comparable odds/Kalshi, or strong
  external evidence. If any gate fails, the UI shows `Estimacion PolySignal
  pendiente` with blockers instead of filling a percentage.
- `docs/analyzer-estimate-gates.md` documents these gates and the test-only
  Samantha fixtures. Focused scripts `test:estimate-gates` and
  `test:samantha-report-validation` prove market price alone, weak Samantha
  context and unsafe report payloads do not generate a PolySignal estimate.
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
- The selected report now also exposes a Deep Analyzer readiness strip. It is a
  product contract, not a live job yet. It lists Polymarket market data, market
  movement, Wallet Intelligence, wallet profiles, external research, odds,
  Kalshi, category context, evidence scoring, history tracking and resolution
  with honest statuses such as available, partial, pending, blocked or
  unavailable.
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
  market/event data from Polymarket/Gamma read-only, wallet data from public
  Polymarket/Gamma read-only sources when available, external research as pending
  or verified, and history from this browser.
- The public report includes an automatic Samantha workflow. It prepares safe
  context, attempts the configured server-side bridge, and shows completed,
  partial, or unavailable-source states without asking the user to paste a
  report.
- Camino B esta preparado con `POST /api/samantha/send-research`: `/analyze`
  puede intentar enviar el contexto de Samantha solo si existe configuracion
  server-side segura. Si no esta configurado, el job queda `awaiting_samantha`
  como lectura parcial/fuente automatica no disponible. Esta ruta no acepta
  destinos del cliente y no es un proxy abierto.
- En desarrollo local, Samantha puede recibir la tarea en
  `POST /polysignal/research-task` si su bridge esta explicitamente habilitado.
  La respuesta actual esperada es `accepted`/`queued_or_manual`; PolySignal no
  marca el analisis como completado hasta recibir un reporte validado.
- `/analyze` ofrece `Consultar resultado de Samantha` cuando existe `taskId`.
  La consulta pasa por `/api/samantha/research-status`; si Samantha responde
  `pending` o `manual_needed`, el job sigue esperando investigacion o queda
  como lectura parcial sin pedir carga manual al usuario.
- The report closes with `Que puedes hacer ahora`: save the analysis, save as
  follow-up when there is no PolySignal estimate, view history, follow the
  market, open market detail, or analyze another link.
- `/history` points users back to `/analyze` through its header, empty state,
  and `Reanalizar enlace` actions for saved records that include the original
  URL.
- QA cases currently protected:
  - `https://polymarket.com/es/sports/nba/nba-okc-lal-2026-05-11` resolves
    from Gamma to the Thunder/Lakers event or shows an honest unavailable state;
    it must never show soccer markets.
  - `https://polymarket.com/es/sports/laliga/lal-cel-lev-2026-05-12` resolves
    from Gamma to the Celta/Levante event or shows an honest unavailable state;
    it must not surface Sevilla/Espanyol, Atletico/Celta, or other unrelated
    matches.
  - `https://polymarket.com/market/lal-cel-lev-2026-05-12-cel` resolves as one
    exact Celta market when Gamma exposes it through the event response; sibling
    draw/Levante markets remain in the event selector only for event links.
  - Malicious URLs such as `polymarket.com.evil.com`, credentials, private IPs,
    custom ports, and dangerous schemes are rejected before any outbound request.
- The final copy should read like a responsible review:
  "PolySignal reviso las capas disponibles" and, when needed, "No hay evidencia
  suficiente para emitir una estimacion propia responsable."
- Saved link analyses can later be checked from `/history` with `Actualizar
  resultados`. This is automatic and does not ask the user to choose the final
  outcome manually.

This phase does not scrape Polymarket, does not write to Neon, and does not
invent probabilities. Link resolution and result verification both use
server-side read-only adapters that validate Polymarket identifiers and call
Gamma's structured endpoints with an allow-list, timeout, no cookies, no
credentials, no dangerous redirects, and no raw payload returned to the browser.

## Phase 2: Structured Polymarket Lookup

Implemented for `/analyze` as a server-side read-only route.

- Resolve Polymarket event/market identifiers server-side.
- Load market title, close time, outcomes, prices, volume, and liquidity from
  the resolved Gamma response.
- Preserve normalized URL, event slug, market slug, remote id, condition id,
  outcome prices, volume, liquidity, and analysis timestamp when the user saves
  to local history.
- Keep market price probability and PolySignal probability as separate fields.
- PolySignal internal markets are allowed for local history and later
  verification, but not for primary link matching.

Still not implemented:

- Persistent backend storage for user analyses.
- Auth-linked history.
- Cached Polymarket resolution records.

## Phase 3: Evidence Search

Not implemented yet.

- Collect official sports data, team news, and relevant public sources.
- Add team form, injuries, suspensions, schedule context, ratings/ELO/xG, and
  comparable sport stats before generating a new estimate.
- Treat Reddit and social discussion as weak/contextual signals only.
- Store sources and timestamps.
- Separate market probability from PolySignal probability.

## Phase 3.5: Deep Analyzer Engine Readiness

Prepared as frontend contracts only.

- `deepAnalyzerTypes.ts` defines the full analysis result, layers, signals,
  market payload and decision object.
- `deepAnalyzerEngine.ts` builds conservative v0 layers from already available
  Polymarket market data and sanitized Wallet Intelligence.
- `deepAnalysisProgress.ts` models future job phases:
  reading Polymarket, analyzing movement, wallets, wallet profiles, preparing
  Samantha automatic context, waiting for automatic sources, external research,
  odds, Kalshi, evidence scoring and decision.
- `samanthaResearchBrief.ts` and `samanthaResearchReport.ts` define the
  structured Samantha contracts. Public UI uses them through the automatic
  bridge and hides manual copy/download/schema tooling behind debug mode.
- `samanthaBridgeTypes.ts`, `samanthaBridge.ts` y
  `/api/samantha/send-research` preparan Camino B automatico seguro. Por
  defecto responde fuente automatica no disponible; solo usa un endpoint
  server-side allowlisted si `SAMANTHA_BRIDGE_ENABLED` y
  `SAMANTHA_BRIDGE_URL` estan configurados.
- Endpoint local recomendado para Samantha:
  `http://127.0.0.1:8787/polysignal/analyze-market`. Recibe contexto
  sanitizado del mercado y Wallet Intelligence, y devuelve `partial` o
  `insufficient_data` sin pedir reportes manuales al usuario.
- Endpoint publico recomendado despues de deploy:
  `https://<samantha-bridge-host>/polysignal/analyze-market`, servido por
  `npm run start:polysignal-bridge` con `SAMANTHA_BRIDGE_TOKEN` obligatorio.
- La ruta local `http://127.0.0.1:8787/polysignal/research-task` queda como
  compatibilidad de cola/dev para Task Packets.
- `DeepAnalysisJob` soporta estados de puente:
  `sending_to_samantha`, `samantha_researching`,
  `receiving_samantha_report` y `validating_samantha_report`.
- The v0 engine never creates a PolySignal probability from market price.
- With only Polymarket data, the decision remains unavailable and does not
  count for accuracy.
- Future layers are visible as readiness/pending, not as claimed evidence.

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

## Analyzer-First Product Pivot

As of 2026-05-12, `/analyze` is the primary product entry point.

Rules:

- The analyzer resolves Polymarket links from Polymarket/Gamma/CLOB read-only
  sources, not from internally loaded sports markets.
- If Polymarket cannot return the market, the analyzer shows an honest no-match
  state instead of cross-sport suggestions.
- Selector cards must come only from the event or market returned by
  Polymarket.
- Deep analysis, Wallet Intelligence and history saving run only after the
  user confirms the selected market.
- The result can be saved to local History and later checked against a final
  Polymarket outcome.

Navigation now points users to:

- `/analyze`
- `/history`
- `/performance`
- `/alerts`
- `/methodology`

Sports browsing, briefing and watchlist views remain legacy/hidden while the
new analyzer-first flow is validated.
