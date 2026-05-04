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

## Dashboard

1. Open `https://polisygnal-web.vercel.app/`.
2. Confirm KPIs show real market counts.
3. Confirm `Mercados destacados` shows cards.
4. Confirm buckets and review filters work without a full page reload.
5. Confirm the safety copy says the app is read-only and not automatic trading.

## Sports

1. Open `https://polisygnal-web.vercel.app/sports/soccer`.
2. Confirm soccer shows real markets.
3. Open `https://polisygnal-web.vercel.app/sports/basketball`.
4. Confirm basketball shows a clean empty state, not `Failed to fetch`.
5. Confirm UFC, cricket, and NHL/Hockey remain disabled and do not navigate as active filters.

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
