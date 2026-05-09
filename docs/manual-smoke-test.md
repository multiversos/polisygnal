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

## Build Diagnostics

1. Open `https://polisygnal-web.vercel.app/api/build-info`.
2. Confirm it returns `app: polisygnal-web`, `proxy: enabled`, and
   `api_host: polisygnal.onrender.com`.
3. If the page looks stale, compare `commit` with the latest Vercel production
   deployment, then hard refresh with `Ctrl+F5` or open an incognito window.

## Public Navigation

1. Open `https://polisygnal-web.vercel.app/`.
2. Confirm the sidebar only shows:
   - Inicio
   - Mercados deportivos
   - Resumen diario
   - Mi lista
   - Alertas
   - Modo oscuro
3. Confirm the sidebar does not show internal sections such as Investigación,
   Evidencia, Workflow, Salud de datos, Trial E2E, or Backtesting.

## Public Home

1. Confirm Inicio shows `Qué revisar ahora`, `Mercados destacados`, and
   `Próximos partidos`.
2. Confirm it shows `Última actualización` and an `Actualizar` button.
3. Confirm CTAs link to Mercados deportivos, Resumen diario, and Alertas.
4. Confirm no visible copy mentions API, backend, JSON, proxy, snapshot,
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

1. Open the public Mi lista route from the sidebar.
2. If no items are saved, confirm it says the list is empty in friendly copy.
3. Confirm it offers a CTA to explore sports markets or soccer.
4. Confirm it does not pretend persistent saving is complete if it is not.

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

## Hidden Data Status

1. Open `https://polisygnal-web.vercel.app/internal/data-status` directly.
2. Confirm the route says `Solo lectura`.
3. Confirm it shows soccer totals, loaded markets, active/closed counts,
   recent/stale counts, and the latest visible activity.
4. Confirm it shows both coverage and gaps:
   - Con actualizacion / Sin actualizacion.
   - Con analisis / Sin analisis.
   - Frescura de datos.
   - Requiere refresh supervisado, or Frescura estable if everything is fresh.
   - Stale 48h.
   - Con precio visible.
   - Con liquidez visible.
   - Con volumen visible.
   - Datos completos.
5. Confirm this page is not linked from the public sidebar or public pages.
6. Confirm it does not show secrets, connection strings, stack traces, or large
   raw payloads.

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

## Cache Troubleshooting

If a normal browser shows old data but backend/proxy checks pass:

1. Open `/sports/soccer` in an incognito window.
2. Hard refresh the normal tab with `Ctrl+F5`.
3. Open `/api/build-info` and compare `commit` with Vercel Production.
4. Open `/api/backend/markets/overview?sport_type=soccer&limit=50`.
5. If `total_count` is greater than 50, also open
   `/api/backend/markets/overview?sport_type=soccer&limit=50&offset=50`.
6. Re-run `npm.cmd --workspace apps/web run smoke:production`.
