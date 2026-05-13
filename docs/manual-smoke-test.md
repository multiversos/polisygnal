# PolySignal Manual Smoke Test

Use these checks after a production deploy. Correct domains:

- Frontend: https://polisygnal-web.vercel.app
- Backend: https://polisygnal.onrender.com
- Do not use `polisignal` or `polysignal`.

## Backend And Proxy

1. Open `https://polisygnal.onrender.com/health` and confirm `status: ok`.
2. Open `https://polisygnal.onrender.com/markets/overview?sport_type=soccer&limit=50`.
3. Confirm `total_count` is at least `75` and `items` is not empty.
4. Open `https://polisygnal-web.vercel.app/api/backend/markets/overview?sport_type=soccer&limit=50`.
5. Confirm the proxy returns the same overview shape and does not expose CORS issues.
6. Open `https://polisygnal-web.vercel.app/api/backend/markets/overview?sport_type=soccer&limit=50&offset=50`.
7. Confirm pagination returns the remaining soccer markets instead of timing out.
8. If one proxy request returns 502, 503, or 504, wait briefly and retry before
   declaring the page broken. A persistent failure across retries is still a
   production issue.
9. Do not raise the soccer limit to 75 or 100 to work around a timeout; use the
   offset pagination checks above.

## Build Diagnostics

1. Open `https://polisygnal-web.vercel.app/api/build-info`.
2. Confirm it returns `app: polisygnal-web`, `proxy: enabled`, and
   `api_host: polisygnal.onrender.com`.
3. If the page looks stale, compare `commit` with the latest Vercel production
   deployment, then hard refresh with `Ctrl+F5` or open an incognito window.

## Public Navigation

1. Open `https://polisygnal-web.vercel.app/`.
2. Confirm the primary public navigation prioritizes:
   - Inicio
   - Analizar enlace
   - Historial
   - Rendimiento
   - Alertas
   - Metodologia
3. Confirm `Analizar enlace` is visually prominent as the principal product
   entry, without exposing internal routes.
4. Confirm sports, briefing and watchlist are not promoted as primary product
   routes.
5. Confirm the sidebar does not show internal sections such as Investigacion,
   Evidencia, Workflow, Salud de datos, Trial E2E, Backtesting, or
   `/internal/data-status`.

## Security Baseline

1. Open `https://polisygnal-web.vercel.app/` and confirm response headers include:
   - `Content-Security-Policy`.
   - `X-Content-Type-Options: nosniff`.
   - `Referrer-Policy: strict-origin-when-cross-origin`.
   - `X-Frame-Options: DENY`.
   - `Permissions-Policy`.
   - `Strict-Transport-Security`.
2. Confirm public pages do not show `DATABASE_URL`, `SECRET`, `TOKEN`,
   `API_KEY`, `password`, `postgres://`, stack traces, or connection strings.
3. Open `/analyze`, paste `http://169.254.169.254/latest/meta-data`, and confirm
   the page rejects it with a friendly Polymarket-only message.
4. Paste `javascript:alert(1)`, `file:///etc/passwd`, and `ftp://polymarket.com/event/test`
   into `/analyze` and confirm each is rejected.
5. Confirm `/api/backend/https:%2F%2Fexample.com` returns a blocked/not-found
   response and does not expose backend hostnames, connection strings, or stack
   traces.
6. Confirm `/internal/data-status` is still not linked from public navigation.
7. Confirm `POST /api/samantha/send-research` without server-side bridge
   configuration returns a controlled manual-fallback response, not a stack
   trace and not a proxy to a user-provided URL.
8. Confirm `POST /api/samantha/research-status` accepts only a bounded `taskId`
   body and never accepts client-provided bridge/destination URLs.

## Local Privacy

1. Open `/history` and confirm it says the historial is local or saved in this
   browser.
2. Confirm `/history` offers `Borrar historial local` and requires browser
   confirmation before clearing.
3. Open `/watchlist` and confirm it says Mi lista is saved in this browser and
   does not sync between devices yet.
4. Confirm `/watchlist` offers `Vaciar Mi lista` and requires browser
   confirmation before clearing.
5. Open `/alerts` and confirm it explains that markets followed in Mi lista are
   read from this browser.
6. Open `/analyze` and confirm it explains that saved analyses go to the local
   history in this browser.
7. Confirm none of these pages claim that accounts, cloud sync, or customer
   storage already exist.
8. Save an analyzer result that is waiting for Samantha and confirm `/history`
   shows the original link, `Continuar analisis`, `Consultar resultado de
   Samantha` when a task id exists, and `Cargar reporte manual`.
9. Confirm `manual_needed`, `pending`, `processing`, or `accepted` research
   states do not appear as completed and do not count as precision.

## Visual Polish

1. Confirm the app opens in a sober dark theme by default unless a user has
   already chosen light mode in this browser.
2. Confirm the sidebar looks like a product navigation panel: solid dark
   surface, restrained active state, consistent icons, and the theme toggle at
   the bottom.
3. Confirm cards and panels use a consistent dark surface, subtle borders, and
   limited accent color instead of bright arcade-style blocks.
4. Confirm filters, chips, and badges are compact and mostly neutral, with only
   the active item using a clear accent.
5. Confirm loading and error states are calm: if a refresh fails, existing data
   should remain visible and the warning should not mention API, backend, or
   proxy details.
6. Check one mobile-width viewport and confirm the sidebar, filters, cards, and
   buttons do not overflow horizontally.

7. Confirm the sport selector uses small line icons instead of large generic
   letters. Expected icons:
   - Todos: compact grid.
   - FÃºtbol: soccer ball.
   - Baloncesto: basketball.
   - NFL: American football.
   - Tenis: racket/ball.
   - BÃ©isbol: baseball.
   - Carreras de caballos: racing/horseshoe mark.
   - UFC: glove/fight mark.
   - CrÃ­quet: bat/ball.
   - NHL / Hockey: stick/puck mark.

## Public Home

1. Confirm Inicio shows a main hero for `Analizar enlace`.
2. Confirm the hero says the flow is to paste a link, confirm the market, and
   save/measure the result over time.
3. Confirm the primary CTA goes to `/analyze` and secondary CTAs go to
   Historial and market exploration.
4. Confirm Inicio still shows `Qué revisar ahora`, `Mercados destacados`, and
   `Próximos partidos`.
5. Confirm it shows `Última actualización` and an `Actualizar` button.
6. Confirm no visible copy mentions API, backend, JSON, proxy, snapshot,
   fallback, debug, pipeline, or market_type.

## Sports

1. Open `https://polisygnal-web.vercel.app/sports`.
2. Confirm it shows Mercados deportivos clearly and does not present empty
   sports as errors.
3. Confirm it shows `Última actualización` and an `Actualizar` button.
4. Confirm UFC, cricket, and NHL/Hockey remain disabled and do not load data.

## Soccer Critical Regression

1. Open `https://polisygnal-web.vercel.app/sports/soccer`.
2. Confirm it shows `Mercados 75` or a higher real total.
3. Confirm it shows `Vista mercados (75)` or the same current total.
4. Confirm it shows `Partidos detectados` and `Próximos partidos`.
5. Confirm at least one match card renders.
6. Confirm match cards show markets inside the card, including prices when
   available and `Ver todos los mercados` when there are more items.
7. Confirm match cards show clear `Equipo A vs Equipo B` titles and circular
   team initials when no real crest is available.
8. Confirm section headings group matches by day and show a match count.
9. Confirm the filter bar says `Mostrando 75 de 75 mercados` or reflects the
   current total from the proxy.
10. Confirm search/filter controls work without a full page reload.
11. Confirm the page shows `Última actualización` and an `Actualizar` button.
12. Confirm closed or expired markets appear as Cerrado or Información parcial,
   not as active opportunities.
13. Confirm cards show a simple reason such as `Para revisar`,
    `En observación`, `Información parcial`, or `Seguir de cerca`.
14. Confirm activity labels such as `Actualizado recientemente`,
    `Con actividad`, `Datos limitados`, or `Próximo partido` come from visible
    market data.
15. Confirm status labels explain themselves in plain language and do not
    promise profit or certainty.
16. Confirm the mobile view has no horizontal overflow and buttons are not cut
    off.
17. Click `Actualizar` and confirm the existing match list stays visible while
    the page refreshes.
18. Confirm it does not show `Datos no disponibles`, `La API no respondió`, or
    `Todavía no hay mercados`.

Run the automated production smoke test from the repo root:

```powershell
npm.cmd --workspace apps/web run smoke:production
```

If this test fails, stop feature work and treat it as a production regression.

## Resumen Diario

1. Open `https://polisygnal-web.vercel.app/briefing`.
2. Confirm it shows `Resumen rápido`, `Para revisar hoy`, and current market
   guidance.
3. Confirm it shows `Última actualización` and an `Actualizar` button.
4. Confirm it explains `Por qué aparecen aquí` before listing markets.
5. Confirm it includes `Qué hacer ahora` and separates markets to review from
   markets in observation.
6. Confirm empty states guide the user back to soccer or sports markets.

## Mi Lista

1. Open `https://polisygnal-web.vercel.app/watchlist` from the sidebar.
2. If no items are saved, confirm it says the list is empty in friendly copy.
3. Confirm it offers CTAs to explore sports markets and soccer.
4. Confirm it says the list is saved in this browser and does not promise
   account sync.
5. If items are saved, confirm each card has `Ver detalle` and `Quitar`.
6. Confirm removing an item updates the list without a full page reload.
7. Confirm `Vaciar Mi lista` is visible and requires browser confirmation before
   clearing local data.

## Historial

1. Open `https://polisygnal-web.vercel.app/history` from the sidebar.
2. Confirm the page says `Historial de analisis`.
3. Confirm the header has `Analizar nuevo enlace`.
4. If no analyses are saved, confirm the empty state is clear and links back to
   `/analyze`.
5. Open a market detail page from `/sports/soccer`.
6. Click `Guardar en historial`.
7. Return to `/history` and confirm the saved analysis appears.
8. If the saved record has a URL, confirm it offers `Reanalizar enlace`.
9. Confirm the metric cards update from local browser data.
10. Confirm charts never invent an accuracy rate when there are no finalized
   results.
11. Confirm the page does not promise profit, certainty, or betting advice.
12. Confirm public copy does not show API, backend, JSON, proxy, snapshot,
    fallback, debug, pipeline, market_type, model_version, or raw data.
13. Confirm `Borrar historial local` is visible and requires browser
    confirmation before clearing local data.
14. Confirm `Actualizar resultados` is visible.

## Deep Analyzer / Samantha

1. Open `/analyze` and analyze a valid Polymarket link.
2. Confirm Radar Analytics remains visible when the job is waiting for Samantha
   instead of disappearing after Polymarket is read.
3. Confirm the report shows `Copiar tarea para Samantha`, `Descargar tarea
   JSON`, `Descargar instrucciones TXT`, `Copiar schema de respuesta` and
   `Descargar brief JSON`.
4. Confirm the UI says Samantha automatic bridge is unavailable or pending when
   no server-side config exists, and that manual fallback is available.
5. Paste invalid report JSON and confirm the error is specific and friendly.
6. Paste a valid controlled report JSON and confirm the job advances to evidence
   loaded or ready-to-score without inventing a prediction.
7. Save the analysis and confirm `/history` shows `Esperando Samantha`,
   `Samantha investigando`, or equivalent pending research state, not hit/miss.
8. Confirm `/performance` does not count research-pending analyses as failures.
15. Click `Actualizar resultados` and confirm the page says it is verifying
    automatically. It must not ask the user to choose `Gano YES` or `Gano NO`.
16. Confirm the page explains `Como se mide PolySignal`: only clear PolySignal
    predictions with verified final outcomes count as hit/miss.
17. Confirm pending, cancelled, unknown, weak-decision, and no-estimate records
    are not counted as failures.
18. Confirm result source copy is understandable:
    `Verificado con Polymarket`, `Verificado con datos PolySignal`, or
    `No verificado todavia`.
19. Confirm a dangerous `/api/resolve-polymarket` request such as
    `polymarket.com.evil.com` is rejected and does not return raw payloads.

## Analizar Enlace

1. Open `https://polisygnal-web.vercel.app/analyze` from the sidebar.
2. Confirm the page uses the Samantha-first dark visual system:
   - large dark-gradient hero banner;
   - larger PolySignal logo in the sidebar;
   - premium link input with cyan/blue primary button;
   - editable CSS/SVG hero illustration, gauge and mini chart;
   - `Vista previa del análisis` cards;
   - `Qué hace Samantha` side card.
3. Confirm the page shows an input for a Polymarket link and an `Analizar`
   button with placeholder `Pega aquí el enlace del evento o mercado`.
4. Confirm the three-step flow is visible:
   - `Pegar enlace`;
   - `Confirmar mercado`;
   - `Recibir lectura clara`.
5. Confirm the initial preview is clearly pending and does not present demo
   probabilities, invented signals, fake wallets, odds, news or predictions as
   real data.
6. Confirm no visible default copy mentions JSON, snapshot, proxy, OCR,
   localhost, stack traces, secrets or raw payloads.
7. Confirm the initial state explains:
   - Resolvemos el enlace en Polymarket.
   - Confirmas si hay varias opciones.
   - Analizamos solo el mercado elegido.
   - Guardas la lectura para medirla con el tiempo.
8. Paste an invalid link and confirm the page shows a friendly message.
9. Paste a Polymarket link and confirm the page either finds a matching market
   selector, a single selected result, or clearly says it could not be obtained
   from Polymarket.
6. While the valid link is being analyzed, confirm the guided loading panel
   appears with `Analizando mercado` and a central multi-market Radar
   Analytics visual.
7. Confirm the radar is prominent, sober, and analytical: concentric rings,
   subtle signal points, a central PolySignal mark, and category chips around
   the scan.
8. Confirm the loading panel shows the real analysis steps:
   - Detectando enlace.
   - Resolviendo mercado/evento.
   - Analizando mercado seleccionado.
   - Revisando senales disponibles.
   - Revisando billeteras.
   - Preparando lectura.
9. Confirm the radar represents multiple prediction-market categories such as
   Deportes, Noticias, Politica, Mercados, Cripto, Billeteras, Historial, and
   Resolucion. It
   should not feel like a soccer-only loader.
10. Confirm the category visuals use local SVG/CSS only: no external images, no
   real faces, no party logos, and no copyright logos.
11. Confirm the loading panel shows skeleton placeholders for detected market,
    market selection, market probability, PolySignal estimate, Wallet
    Intelligence, and final verification.
12. Confirm the steps have visible text states and do not depend only on color.
13. Confirm the loading panel does not show a fake 0%-100% progress bar and does
   not stay stuck after the analysis finishes.
14. Confirm `Limpiar` removes the loader, result, and errors.
15. Confirm mobile stacks as title, radar, steps, and skeletons without
    horizontal overflow.
16. Confirm `/analyze` does not ask for screenshots, image upload, or OCR.
17. Confirm a valid link first shows a compact selector or one confirmed result,
    not ten full analysis cards.
18. Confirm `/analyze` resolves links from Polymarket/Gamma read-only, not from
    `/sports/soccer`, `/markets/overview`, or loaded internal markets.
19. Test the NBA link
    `https://polymarket.com/es/sports/nba/nba-okc-lal-2026-05-11`.
    Confirm it either shows the Thunder/Lakers event from Polymarket or an
    honest unavailable state. It must not show Sevilla, Espanyol, Atletico, or
    any soccer market.
20. Test the LaLiga link
    `https://polymarket.com/es/sports/laliga/lal-cel-lev-2026-05-12`.
    Confirm it resolves to Celta/Levante from Polymarket or shows an honest
    unavailable state. It must not show other LaLiga matches that only share
    league/date/one team.
21. Test exact market link
    `https://polymarket.com/market/lal-cel-lev-2026-05-12-cel`.
    Confirm it isolates that single market when Gamma returns it directly or
    through the parent event response. It must not show sibling draw/Levante
    markets unless the pasted link is the event link.
22. Confirm the selector cards are compact: title, event, match reason, date,
    real outcomes/prices when available, and an `Analizar este mercado` action.
23. If an event returns many markets, confirm the selector has a local filter and
   `Ver mas mercados` instead of opening many reports.
24. Click `Analizar este mercado` and confirm the deep analysis appears for one
   selected market only.
25. Confirm Wallet Intelligence appears only after selecting/analyzing a market,
   not for every secondary candidate.
26. If a market is found, confirm it shows `Probabilidad del mercado` with YES
   and NO values only when visible prices exist.
27. If a market has non-YES/NO outcomes such as Thunder/Lakers or Over/Under,
   confirm those real outcome labels are shown instead of inventing YES/NO
   labels.
28. Confirm the selected result is organized as an `AnalyzerReport` style
   report with `Centro de analisis`, `Resumen del analisis`, `Que encontro
   PolySignal`, `Capas revisadas`, and `Fuentes del analisis`.
29. Confirm `Probabilidad del mercado` is described as based on the visible
   market price, not as a PolySignal estimate.
30. Confirm `Estimacion PolySignal` shows a pending state unless the conservative
   gates pass: Polymarket reference, validated Samantha report with accepted
   estimate, and at least one independent real support.
30a. Run the controlled gate tests locally before trusting a new estimate UI:
   `npm.cmd --workspace apps/web run test:estimate-gates` and
   `npm.cmd --workspace apps/web run test:samantha-report-validation`.
31. Confirm a market-price-only match does not show the same value as a
   PolySignal estimate and does not show a `0.0 pts` difference as useful
   analysis.
32. Confirm `Preparacion de estimacion PolySignal` or equivalent readiness copy
   appears inside a compact/collapsible layer and lists whether independent
   signals are available.
33. Confirm `Contexto del partido` appears for matched soccer markets inside a
   compact/collapsible layer and shows only available data: teams from title,
   date if present, sport, and missing league/home-away/form/injury/odds fields.
34. Confirm `Preparacion de datos` is presented as data availability, not as a
   probability of winning.
35. Confirm no league, local/visitor role, recent form, injuries, suspensions,
   or external odds are invented.
36. Confirm `Investigacion externa` is visible and shows missing categories
   rather than fake sources.
37. Confirm it says there are no verified external sources if no real findings
   are loaded.
38. Confirm `Inteligencia de billeteras` is visible as a compact auxiliary
   layer.
39. If wallet data exists, confirm it shows only shortened wallet addresses,
   threshold `$100+`, capital observed, YES/NO/Neutral bias, confidence, and
   auxiliary-signal copy.
40. Confirm wallet lookup uses the resolved Polymarket `conditionId`/token IDs
   for the selected market, not an internal sports market fallback.
41. If no wallet data exists, confirm it says `No encontramos datos publicos
   suficientes de billeteras para este mercado` without breaking the analysis
   result.
42. Confirm wallet profile copy says there is not enough public history unless
   closed-position history is actually present.
43. Confirm it does not show fake wallets, full wallet addresses, ROI, win rate,
   or copied-trader advice.
44. Confirm it says public wallet activity is not mapped to real people and that
   the signal is auxiliary, not a prediction or recommendation.
45. Open `Ver todas las billeteras analizadas` when wallet data exists and
   confirm the drilldown stays compact, uses shortened addresses only, and does
   not show fake ROI or win-rate values.
46. Confirm `Historial relacionado` is visible. If the market was analyzed
   before, it should show the latest local record; otherwise it should say the
   market is not in local history yet.
47. Confirm `Decision de PolySignal` follows the 55% threshold:
   YES `>=55%` is clear YES, NO `>=55%` is clear NO, and 45/55 is `Sin decision fuerte`.
47a. Confirm a valid Samantha report below the 55% threshold can add context but
   does not create a countable clear decision.
46. Confirm market price alone never creates a PolySignal predicted side.
47. Confirm it shows only real visible data: title, event, status, price if
   available, volume/liquidity if available, and last update.
48. Confirm it offers `Que puedes hacer ahora` with `Guardar analisis` or
   `Guardar como seguimiento`, `Ver historial`, `Ver detalle`, `Seguir mercado`,
   and `Analizar otro enlace` when a market is matched.
49. Save the analysis, open `/history`, and confirm the item appears as
   `Desde enlace`.
50. Confirm the saved history item shows market YES/NO probability if it was
    available, and PolySignal YES/NO only if it existed.
51. Confirm `/history` shows whether the item counts for precision or does not
    count yet.
52. Confirm `/history` shows `Comparacion mercado vs PolySignal` without
    inventing data when there are not enough comparable records.
53. Confirm a no-match link can only be saved as pending and does not invent a
   probability.
54. Confirm the page does not promise profit, certainty, or betting advice.
55. Confirm the saved record only gets a PolySignal predicted side when a real
    PolySignal estimate crossed the 55% threshold. Market price alone must not
    create a predicted side.
56. Confirm saved matched records preserve Polymarket identifiers when available
    so Historial can later verify outcomes automatically.

## Alertas

1. Open `https://polisygnal-web.vercel.app/alerts`.
2. Confirm it shows Alertas in simple language.
3. Confirm it shows `Última actualización` and an `Actualizar` button.
4. Confirm it explains that alerts are basic reminders connected to markets
   the user follows.
5. If there are no important alerts, confirm it says so clearly and offers a
   CTA to Mercados deportivos.

## Market Detail

1. Open a market from `/sports/soccer`.
2. Confirm the detail page focuses on title, status, price, analysis, history,
   and list follow-up.
3. Confirm it includes `Por qué aparece este mercado`, `Qué revisar`, or
   `Qué significa esto` in plain language.
4. Confirm it links back to Inicio, Mercados deportivos, and the sport page.
5. Confirm it does not show public links to JSON, API docs, raw IDs, or command
   snippets.
6. Confirm it shows `Estimacion propia no disponible` when independent signals
   are missing and explains what data is needed.
7. Confirm it shows `Contexto deportivo` for soccer markets.
8. Confirm `Preparacion de datos` is labelled as non-predictive.
9. Confirm it does not invent league, home/away, form, injuries, suspensions,
   external odds, or calibration.
10. Confirm it shows `Evidencia para estimacion`.
11. Confirm empty evidence states say external verified sources are not
   available yet instead of showing demo findings.
12. Confirm it shows `Billeteras relevantes`.
13. Confirm the wallet section uses shortened addresses only when real public
    data exists, and otherwise says wallet data is not available yet.
14. Confirm it shows capital observed, YES/NO/Neutral bias and confidence only
    from real read-only data.
15. Confirm it does not show fake wallet ROI/win-rate values and does not
    recommend copying operations.

## Hidden Data Status

1. Open `https://polisygnal-web.vercel.app/internal/data-status` directly.
2. Confirm the route says `Solo lectura`.
3. Confirm it shows `Estado proxy publico` with a clear available or
   unavailable state.
4. Confirm it shows soccer totals, loaded markets, active/closed counts,
   recent/stale counts, and the latest visible activity.
5. Confirm it shows both coverage and gaps:
   - Con actualizacion / Sin actualizacion.
   - Con analisis / Sin analisis.
   - Frescura de datos.
   - Requiere refresh supervisado, or Frescura estable if everything is fresh.
   - Stale 48h.
   - Con precio visible.
   - Con liquidez visible.
   - Con volumen visible.
   - Datos completos.
6. Confirm it shows soccer data readiness:
   - Equipos identificados.
   - Con fecha.
   - Contexto parcial.
   - Listos para investigacion.
   - Top missing data categories.
7. Confirm it shows external research readiness:
   - Con contexto deportivo.
   - Con evidencia externa real.
   - Sin evidencia externa.
   - Pendiente de integracion de fuentes.
8. Confirm it shows Wallet Intelligence readiness:
   - Disponible parcial read-only or Read-only conectado.
   - Umbral activo `$100+`.
   - No addresses or personal data.
9. Confirm this page is not linked from the public sidebar or public pages.
10. Confirm it does not show secrets, connection strings, stack traces, or large
   raw payloads.
11. Confirm it is clearly read-only and does not expose buttons or commands that
   can refresh, score, import, delete, migrate, or trade.

## Public Insight Language

Use these quick checks when reviewing public pages:

1. `Analizado` means there is enough information for an initial reading.
2. `En observación` means the market is being followed but is not highlighted yet.
3. `Información parcial` means some information is available but the market is not complete.
4. `Para revisar` means the market is worth a manual look, not a guaranteed outcome.
5. `Actualizado recientemente` means a recent visible update exists.
6. `Con actividad` means volume or liquidity is visible.
7. `Datos limitados` means the app has incomplete data and should not overstate the market.
8. Confirm public copy says this is not financial advice, does not promise
   results, and does not tell the user to buy or bet.

## Analyzer-First Product Flow

1. Open `/`.
2. Confirm the primary CTA is `Analizar enlace`.
3. Confirm the home explains:
   - paste a Polymarket link,
   - confirm the market,
   - save the reading,
   - verify final result,
   - measure accuracy over time.
4. Confirm the public sidebar prioritizes:
   - Analizar enlace,
   - Historial,
   - Rendimiento,
   - Alertas,
   - Metodologia.
5. Confirm sports, briefing and watchlist are not promoted in public
   navigation.
6. Open `/analyze` and test a valid Polymarket link.
7. Confirm only markets returned by Polymarket appear in the selector.
8. Confirm deep analysis runs only after selecting one market.
9. Save the analysis and open `/history`.
10. Confirm `/history` shows the saved item, tracking status, reanalysis action
    and `Actualizar resultados`.
11. Open `/performance` and confirm accuracy is not invented when there are no
    resolved clear predictions.
12. Open `/alerts` and confirm it references saved analyses, not a generic
    sports watchlist.
13. Open `/sports` directly and confirm it is marked as a legacy view.
14. Confirm pending, cancelled, unknown and no-clear-decision items are not
    counted as misses.
15. Open `/methodology` and confirm it explains:
    - Polymarket-first source,
    - market probability vs PolySignal estimate,
    - 55% threshold for clear decisions,
    - Wallet Intelligence as auxiliary only,
    - no copy-trading or guaranteed outcomes.
16. Open a market detail page directly and confirm the primary CTA points back
    to `/analyze` or `/history`, not to sports browsing.

## Deep Analyzer Readiness

1. Open `/analyze`.
2. Confirm the initial copy says the selected market receives an analisis
   profundo.
3. Run a valid Polymarket link and select one market if a selector appears.
4. Confirm `AnalyzerReport` shows a compact `Analisis profundo` / capas del
   motor section.
5. Confirm these layers appear as available, partial, pending, blocked, or not
   available:
   - Polymarket.
   - Movimiento del mercado.
   - Wallet Intelligence.
   - Perfiles de billeteras.
   - Investigacion externa.
   - Odds externas.
   - Kalshi.
   - Contexto por categoria.
   - Scoring de evidencia.
   - Historial.
   - Resolucion.
6. Confirm pending/future layers do not claim that internet, odds, Kalshi or
   wallet profiles were actually queried.
7. Confirm there are no fake news, fake odds, fake Kalshi matches, fake wallet
   ROI/win rate, fake outcomes, or fake PolySignal probabilities.
8. Confirm the Radar Analytics loader marks unintegrated layers as pending
   rather than completed evidence.

## Progreso del analisis profundo

1. Open `/analyze`.
2. Paste a valid Polymarket link and confirm/select one market.
3. Confirm the report shows `Progreso del analisis`.
4. Confirm the job shows:
   - Mercado leido desde Polymarket.
   - Datos principales revisados.
   - Actividad de billeteras revisada o bloqueada de forma honesta.
   - Tarea de investigacion preparada.
   - `Esperando investigacion externa`.
   - Odds/Kalshi/profile steps blocked or pending integration.
5. Confirm the report does not say the deep analysis is completed while waiting
   for Samantha.
6. Use `Copiar tarea para Samantha`, `Descargar tarea JSON`,
   `Descargar instrucciones TXT`, or `Copiar schema de respuesta`.
7. Save the analysis as pending and open `/history`.
8. Confirm the saved item shows `Pendiente de investigacion`, the brief date when
   available, and a `Continuar analisis` action.
9. Paste an invalid Samantha report and confirm it fails without changing the
   job to completed.
10. In a safe local test, paste a valid structured report and confirm the job
    updates evidence/scoring state without inventing market data.
11. Confirm `/performance` does not count awaiting research or ready-to-score
    records as hit/miss.
12. Confirm `/performance` separates `Pendientes de investigacion` from
    `Pendientes de resolucion`.

## Samantha Research Manual Workflow

1. Open `/analyze` and analyze a Polymarket link.
2. Confirm the selected report shows `Investigacion con Samantha`.
3. Confirm these actions are present:
   - `Copiar tarea para Samantha`.
   - `Descargar tarea JSON`.
   - `Descargar instrucciones TXT`.
   - `Copiar schema de respuesta`.
   - `Descargar brief JSON`.
4. Confirm the copy says this is manual/local and does not execute Samantha.
5. Paste invalid JSON and confirm `Validar reporte` shows a friendly validation
   error without applying the report.
6. Paste a report with a dangerous URL, a secret-like value, an estimate outside
   `0..100`, Reddit high reliability, or Kalshi non-equivalent strong signal
   and confirm it is rejected.
6a. Paste or test a report containing script-like text, trading instructions,
   ROI `100%`, win rate `100%`, or a full wallet address and confirm the
   validator rejects it.
7. Paste a valid structured report in a safe test environment, click
   `Validar reporte`, confirm the preview summarizes evidence counts, then
   click `Cargar reporte al analisis`.
8. Confirm evidence appears as source-backed context.
9. Confirm Reddit/social evidence is never accepted as high reliability.
10. Confirm Kalshi evidence is accepted only when equivalent.
11. Confirm no full wallet addresses, secrets, raw payloads or copy-trading
   language appear.
12. Confirm no prediction is created unless the suggested estimate passes the
    strict validation gate.

## Samantha Bridge Local Dev

Use only in local/dev. Production must remain disabled unless explicitly
configured.

1. In Samantha, enable the local endpoint with
   `POLYSIGNAL_RESEARCH_BRIDGE_ENABLED=true` and a local
   `POLYSIGNAL_RESEARCH_BRIDGE_TOKEN`.
2. In PolySignal server-side config, set
   `SAMANTHA_BRIDGE_URL=http://127.0.0.1:8787/polysignal/research-task`,
   `SAMANTHA_BRIDGE_ENABLED=true`, `SAMANTHA_BRIDGE_ALLOW_LOCALHOST=true`, and
   the matching `SAMANTHA_BRIDGE_TOKEN`.
3. Analyze a Polymarket link.
4. Confirm PolySignal sends the task, receives `accepted`, and keeps the job in
   `samantha_researching` or `awaiting_samantha`.
5. Click `Consultar resultado de Samantha` and confirm a pending response keeps
   the job waiting, without marking it completed.
6. Run `npm run polysignal:research:process -- --task-id=<task-id>` in
   Samantha and confirm PolySignal then reads `manual_needed`, keeps manual
   fallback visible and does not invent a report.
7. Confirm Radar Analytics remains visible and manual fallback buttons remain
   available.
8. Confirm the job is not marked completed until a valid Samantha report is
   loaded and passes PolySignal gates.
9. Confirm Samantha's pending queue contains only a sanitized summary, not raw
   payloads, secrets or full wallet addresses.
10. Confirm rejected requests include: missing token, non-Polymarket URL, full
   wallet address, script-like text, oversized payload and trading instruction.

## Cache Troubleshooting

If a normal browser shows old data but backend/proxy checks pass:

1. Open `/sports/soccer` in an incognito window.
2. Hard refresh the normal tab with `Ctrl+F5`.
3. Open `/api/build-info` and compare `commit` with Vercel Production.
4. Open `/api/backend/markets/overview?sport_type=soccer&limit=50`.
5. If `total_count` is greater than 50, also open
   `/api/backend/markets/overview?sport_type=soccer&limit=50&offset=50`.
6. Re-run `npm.cmd --workspace apps/web run smoke:production`.
