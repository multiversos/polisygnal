# PolySignal Manual Smoke Test

Use these checks after a production deploy. Correct domains:

- Frontend: https://polisygnal-web.vercel.app
- Backend: https://polisygnal.onrender.com
- Do not use `polisignal` or `polysignal`.

## Backend

1. Open `https://polisygnal.onrender.com/health`.
2. Confirm JSON shows `status: ok`.
3. Open `https://polisygnal.onrender.com/markets/overview?limit=20`.
4. Confirm `total_count` is greater than `0` and `items` is not empty.

## Proxy

1. Open `https://polisygnal-web.vercel.app/api/backend/markets/overview?sport_type=soccer&limit=20`.
2. Confirm it returns the same shape as backend `/markets/overview`.
3. Confirm no browser CORS error is needed for visible pages.

## Build Diagnostics

1. Open `https://polisygnal-web.vercel.app/api/build-info`.
2. Confirm it returns `app: polisygnal-web`, `proxy: enabled`, and
   `api_host: polisygnal.onrender.com`.
3. If the page looks stale, compare `commit` with the latest Vercel production
   deployment, then hard refresh with `Ctrl+F5` or open an incognito window.
4. Re-check the proxy endpoint above before treating the UI as disconnected.

## Dashboard

1. Open `https://polisygnal-web.vercel.app/`.
2. Confirm KPIs show real market counts.
3. Confirm `Mercados destacados` shows cards.
4. Confirm buckets and review filters work without a full page reload.
5. Confirm the safety copy says the app is read-only and not automatic trading.

## Sports

1. Open `https://polisygnal-web.vercel.app/sports/soccer`.
2. Confirm soccer shows 20 market cards.
3. Open `https://polisygnal-web.vercel.app/sports/basketball`.
4. Confirm basketball shows a clean empty state, not `Failed to fetch`.
5. Confirm UFC, cricket, and NHL/Hockey remain disabled and do not navigate as active filters.
6. Confirm `/sports/soccer` does not show `La API no respondió` or `Datos no disponibles`.

## Critical Regression: Soccer Must Render Data

Run the automated production smoke test from the repo root:

```powershell
npm.cmd --workspace apps/web run smoke:production
```

The test must confirm:

1. `/api/build-info` returns the current production build metadata.
2. `/api/backend/markets/overview?sport_type=soccer&limit=20` returns
   `total_count=20` and 20 `items`.
3. `/sports/soccer` renders at least 20 market cards in headless Chrome.
4. `/sports/soccer?debug_ts=<timestamp>` also renders market cards.
5. The rendered page does not contain `Datos no disponibles`,
   `La API no respondió`, or `Todavía no hay mercados`.

If this test fails, stop feature work and treat it as a production regression.

## Cache Troubleshooting

If a normal browser shows `Datos no disponibles` but backend/proxy checks pass:

1. Open `https://polisygnal-web.vercel.app/sports/soccer` in an incognito window.
2. Hard refresh the normal tab with `Ctrl+F5`.
3. Open `https://polisygnal-web.vercel.app/api/build-info` and compare `commit`
   with the latest Vercel production deployment.
4. Open `https://polisygnal-web.vercel.app/api/backend/markets/overview?sport_type=soccer&limit=20`.
5. Confirm the proxy returns `total_count=20` and 20 `items`.
6. If the proxy works and incognito works, treat the issue as local browser cache
   or an old tab rather than a backend outage.
7. Re-run `npm.cmd --workspace apps/web run smoke:production` to compare the
   user browser with a clean headless render.

## Market Detail

1. From the dashboard, open `Ver analisis` on a market.
2. Confirm the page shows quick read, technical data, prices, score, confidence, evidence fallback, history fallback, and links back to dashboard/sport.
3. Confirm missing evidence or history appears as a planned empty state, not a broken API message.

## Data Health

1. Open `https://polisygnal-web.vercel.app/data-health`.
2. Confirm the market overview summary shows real counts from `/markets/overview`.
3. Confirm it clearly states the view is read-only.

## Modules In Preparation

1. Open `/research`, `/evidence`, `/sources`, `/external-signals/matches`, and `/backtesting`.
2. Confirm each page says the module is in preparation when data is not present.
3. Confirm none of those pages suggests the global API is broken unless the backend is actually unavailable.
