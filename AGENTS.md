# PolySignal Project Instructions

These are project-local instructions for any agent working inside PolySignal. Samantha does not live in this repo; she may enter this repo as one project under her broader `N:\projects` workspace.

## Project Shape

- Repo root: `N:\projects\polimarket`
- Backend: `apps/api`, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL.
- Frontend: `apps/web`, Next.js App Router, React, TypeScript.
- Future/background work: `apps/worker`.
- Shared/domain packages live under `packages/*`.
- Operational docs live under `docs/`; read the relevant doc before changing pipeline, data, deploy, or scoring behavior.

## Current Product Context

PolySignal is an MVP for discovering Polymarket markets, storing market/snapshot/prediction data, and exposing read-only operational views.

Production domains:

- Frontend: `https://polisygnal-web.vercel.app`
- Backend: `https://polisygnal.onrender.com`

Do not use these incorrect domains:

- `https://polisignal.onrender.com`
- `https://polysignal.onrender.com`

## Guardrails

- Never commit real `.env` files, database URLs, service keys, API keys, OAuth tokens, or secrets.
- Do not print full connection strings or secret values in logs or final answers.
- Do not run production imports, discovery, scoring, trading, or any command with `--apply` unless the user explicitly asks for that exact operation.
- Dry runs are preferred for market import/discovery work.
- Always use explicit limits for data commands.
- Keep UFC, cricket, and NHL/Hockey visible but disabled unless the product direction changes.
- Treat the app as read-only; do not add automated trading behavior.

## Safety Boundaries

- Treat `N:\projects\polimarket` as the only normal write workspace.
- Do not edit files outside this repo unless the user explicitly names the target path and asks for it.
- Do not change Windows system settings, registry, services, scheduled tasks, PATH, firewall, antivirus, drivers, or global package manager state unless the user explicitly asks for that operation.
- Do not run destructive filesystem commands such as recursive delete/move, mass rename, `Remove-Item -Recurse`, `del /s`, `rmdir /s`, `git clean`, or broad glob deletes without explicit user confirmation and a precise target path.
- Do not run destructive Git commands such as `git reset --hard`, `git checkout -- .`, `git restore .`, branch deletion, force push, or history rewrite unless the user explicitly asks for that exact operation.
- Before any migration, import, sync, or command that could write to a real database, first run the safe dry-run/check command and report what would change.
- If a command requires secrets, read them only from the current environment or existing ignored local config; never write them into tracked files.
- Prefer targeted tests and checks over broad automation when the blast radius is unclear.

## Common Commands

From repo root:

```powershell
npm.cmd run dev:web
npm.cmd run build:web
npm.cmd --workspace apps/web run smoke:production
```

Backend setup and checks:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
.\.venv\Scripts\python.exe -m app.commands.check_database_config
.\.venv\Scripts\python.exe -m app.commands.check_database_config --connect
```

Safe market dry-run examples:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m app.commands.import_live_discovered_markets --dry-run --sport soccer --days 30 --limit 100 --max-import 10 --json --debug-skips
.\.venv\Scripts\python.exe -m app.commands.score_missing_markets --dry-run --sport-type soccer --limit 10 --json
```

## Validation Expectations

- For backend changes, run targeted tests first, then `.\.venv\Scripts\python.exe -m pytest` when practical.
- For frontend changes, run `npm.cmd run build:web`.
- For production-facing frontend risk, run `npm.cmd --workspace apps/web run smoke:production`.
- If a validation command cannot run because secrets or services are missing, report that clearly and continue with the safest local checks.

## Useful Docs

- `README.md`: project overview and current next steps.
- `apps/api/README.md`: backend endpoints, commands, pipeline behavior.
- `docs/project-status.md`: current production status and guardrails.
- `docs/safe-limited-market-pipeline.md`: safe dry-run flow for market coverage.
- `docs/manual-smoke-test.md`: production smoke checklist.
- `docs/architecture.md`: initial architecture.

## Working Style

- Prefer small, reviewable changes that match existing patterns.
- Read local code before changing behavior.
- Keep operational behavior explicit and auditable.
- Preserve user changes in the working tree.
- When changing data pipeline behavior, add or update tests and docs together.
