# PolySignal Production Troubleshooting

Last updated: 2026-05-10

This runbook is for read-only production diagnosis. It does not authorize data
writes, imports, migrations, trading, or scoring.

## What A 504 Means

A 504 from the web proxy usually means the frontend route waited for the Render
backend and did not receive a response before the proxy timeout. It can happen
when Render is cold, the backend is slow, or a query is too large.

PolySignal should not look broken after one transient 504:

- public fetches retry short transient failures;
- `/sports/soccer` keeps the last successful data visible during refresh;
- public copy shows a calm "last information available" message;
- production smoke retries critical JSON calls but still fails if the problem
  persists.

## Quick Checks

Use the correct production domains:

- frontend: `https://polisygnal-web.vercel.app`
- backend: `https://polisygnal.onrender.com`

Check build/deploy:

```text
https://polisygnal-web.vercel.app/api/build-info
```

Check the first soccer page through the proxy:

```text
https://polisygnal-web.vercel.app/api/backend/markets/overview?sport_type=soccer&limit=50
```

Check the second soccer page through the proxy:

```text
https://polisygnal-web.vercel.app/api/backend/markets/overview?sport_type=soccer&limit=50&offset=50
```

Check the public page:

```text
https://polisygnal-web.vercel.app/sports/soccer
```

Check the hidden read-only diagnostic page:

```text
https://polisygnal-web.vercel.app/internal/data-status
```

## Why Soccer Uses Offset Pagination

`/sports/soccer` loads soccer markets in pages of 50 because larger single
requests such as `limit=75` or `limit=100` have timed out before. The known
stable pattern is:

- first page: `limit=50&offset=0`
- second page: `limit=50&offset=50`

Do not raise the public page size just to reduce requests. Measure first.

## How To Distinguish Failure Types

Backend slow or cold:

- `/api/build-info` works.
- `/api/backend/markets/overview?...` returns 502/503/504 temporarily.
- A retry passes after a short delay.
- `/internal/data-status` may show "No se pudo consultar" but should not expose
  internal hostnames or stack traces.

Proxy timeout:

- Backend may work directly, but the same query through `/api/backend/*` returns
  a temporary unavailable response.
- Keep the request shape small and paginated.
- Re-run the proxy checks after waiting briefly.

Frontend parsing issue:

- Proxy JSON endpoint returns a valid response.
- `/sports/soccer` fails to render or shows a public error.
- Run local build and production smoke before changing data.

Vercel cache/deploy issue:

- `/api/build-info` shows an old commit.
- Public page copy or smoke expectations do not match the latest commit.
- Wait for deployment, hard refresh, or check the Vercel production deployment.

## What Not To Do

- Do not use `--apply` to fix a visual or proxy error.
- Do not use `--delete-existing`.
- Do not raise `limit` to 75 or 100 when 50-page offset pagination works.
- Do not delete data to clear an error.
- Do not run migrations for a timeout.
- Do not print secrets, connection strings, or environment variables.

## Production Checklist

1. Confirm `/api/build-info` serves the expected commit.
2. Confirm `/api/backend/markets/overview?sport_type=soccer&limit=50` returns
   JSON with `total_count >= 75`.
3. Confirm `/api/backend/markets/overview?sport_type=soccer&limit=50&offset=50`
   returns the remaining page.
4. Confirm `/sports/soccer` still shows markets, filters, and match cards.
5. Confirm `/internal/data-status` is read-only and shows proxy/public data
   health.
6. Run:

```powershell
npm.cmd --workspace apps/web run smoke:production
```

If all retries fail, treat it as a production incident instead of hiding it.
