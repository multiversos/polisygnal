# Public Market Refresh Plan

This plan prepares recurring market refresh without enabling an automatic
production scheduler yet.

## Current Safe Command

Use the soccer orchestrator in dry-run first:

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m app.commands.refresh_soccer_markets --dry-run --days 7 --pages 5 --limit 100 --max-events 10 --max-import 30 --max-snapshots 30 --score-limit 30 --json --debug-skips
```

Dry-run is the default. It reads candidates, snapshots, and scoring gaps, then
reports what would happen without writing data.

For a reviewable local report, add:

```powershell
--report-json N:\projects\_polysignal_backups\refresh-soccer-dry-run.json
```

`--report-json` is intentionally rejected with `--apply`.

## Current Soccer Freshness Baseline

Latest public read-only status, reviewed 2026-05-09:

- Soccer markets: 75.
- Loaded by the public frontend: 75 through paginated overview requests.
- With snapshot/update: 60.
- Without snapshot/update: 15.
- With prediction/analysis: 50.
- Without prediction/analysis: 25.
- Active: 75.
- Closed: 0.
- Updated in the last 48 hours: 25.
- Stale or missing recent update: 50.
- With visible price/liquidity/volume: 60.

## Existing Soccer Refresh Runbook

Use this flow to prepare a refresh for soccer markets that already exist in the
database. This is not a discovery/import flow and must not add new markets.

Local Codex currently detects a localhost database, not Neon. Treat local runs
as functional tests only. A production dry-run must run from an environment
with the Neon pooled `DATABASE_URL`, such as a Render shell/job, a Render
one-off job, or the manual GitHub Actions workflow if the approved secret is
configured.

Preflight, from the trusted environment:

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m app.commands.check_database_config --connect
```

Continue only if the masked output confirms Neon, for example
`looks_like_neon=true`. Stop if it reports localhost or any unexpected host.

First real command must be dry-run only:

```powershell
# NO EJECUTADO EN ESTE SPRINT
.\.venv\Scripts\python.exe -m app.commands.refresh_existing_soccer_markets --sport soccer --limit 25 --stale-hours 48 --report-json N:\projects\polimarket\logs\reports\dry-runs\existing-soccer-refresh-neon-dry-run.json --json
```

Review `candidate_count`, `stale_candidates`,
`missing_snapshot_candidates`, `missing_prediction_candidates`,
`would_refresh_snapshots`, `would_score_predictions`, `skip_reasons`, and
`sample_candidates`. Do not proceed if the DB is not Neon, candidates look like
the wrong sport, more than a small number of errors appear, or `total_count`
changes unexpectedly.

Apply is deliberately blocked in `refresh_existing_soccer_markets` until a
separate supervised write implementation is approved. If an apply flow is later
implemented, it must require both `--apply` and
`--yes-i-understand-this-writes-data`, and the reviewed command must be marked
as **NO EJECUTADO** until the operator approves it.

Never use:

- `--delete-existing`
- trading commands
- migrations
- import/discovery apply commands
- higher limits without explicit approval

Post-refresh validation for a future supervised run:

- `python -m app.commands.inspect_soccer_market_health --json`
- `/internal/data-status`
- `/sports/soccer`
- `npm.cmd --workspace apps/web run smoke:production`

Latest local command smoke, 2026-05-10:

```powershell
.\.venv\Scripts\python.exe -m app.commands.refresh_existing_soccer_markets --limit 25 --stale-hours 48 --report-json N:\projects\polimarket\logs\reports\dry-runs\existing-soccer-refresh-local-dry-run.json --json
```

This run used the local database (`host=localhost`, `looks_like_neon=false`).
It is a functionality check only, not production authorization. Result:
`candidate_count=0`, `stale_candidates=0`,
`missing_snapshot_candidates=0`, `missing_prediction_candidates=0`,
`would_refresh_snapshots=0`, and `would_score_predictions=0`.

Important caveat: the previous `limit=100` soccer dry-run was run while the
shell was using local database configuration because Neon `DATABASE_URL` was
not loaded. Treat that report as local diagnostics only. Before any future
write, repeat preflight and dry-run after pasting the Neon pooled
`DATABASE_URL` privately in PowerShell, then confirm the candidate and
duplicate counts again.

## Supervised Apply

Only run apply from a supervised PowerShell session after reviewing dry-run
output and confirming the target database privately:

```powershell
$env:POLYSIGNAL_ENV = "production"
$secureDatabaseUrl = Read-Host "Paste Neon pooled DATABASE_URL" -AsSecureString
$env:DATABASE_URL = [System.Net.NetworkCredential]::new("", $secureDatabaseUrl).Password
.\.venv\Scripts\python.exe -m app.commands.check_database_config --connect
.\.venv\Scripts\python.exe -m app.commands.refresh_soccer_markets --apply --yes-i-understand-this-writes-data --days 7 --pages 5 --limit 100 --max-events 10 --max-import 30 --max-snapshots 30 --score-limit 30 --json --debug-skips
```

Do not use `--delete-existing`. Full replacement requires a soccer-only backup,
a reviewed transaction plan, and explicit operator approval.

## Latest Soccer Dry-Run Review

Last reviewed dry-run: 2026-05-07.

Command used:

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m app.commands.refresh_soccer_markets --days 7 --limit 50 --report-json N:\projects\polimarket\logs\reports\dry-runs\soccer-refresh-dry-run-latest.json --json --debug-skips
```

Outcome:

- Dry-run only: `dry_run=true`, `apply=false`, `read_only=true`.
- Local counts were unchanged before/after the run.
- Existing soccer coverage before the run: 50 markets, 35 snapshots, 35 predictions.
- Candidate events: 10 soccer match groups.
- Candidate markets: 25.
- Markets that would be imported: 25.
- Snapshots that would be created for existing local markets: 12.
- Scoring candidates: 15, all blocked in dry-run because the needed snapshots were not applied.
- Remote markets checked: 4,299.

Candidate matches included:

- Club Atletico de Madrid vs RC Celta de Vigo.
- Manchester City FC vs Brentford FC.
- VfL Wolfsburg vs FC Bayern Munchen.
- Torino FC vs US Sassuolo Calcio.
- BV Borussia 09 Dortmund vs Eintracht Frankfurt.
- Cesena FC vs Calcio Padova.
- Auckland FC vs Adelaide United FC.
- FC Sudtirol vs SS Juve Stabia.
- CU Tecnica de Cajamarca vs FC Cajamarca.
- Stade Lavallois Mayenne FC vs US Boulogne Cote d'Opale.

Main skip reasons:

- `sport_filter_mismatch`: non-soccer or misclassified remote entries were rejected.
- `not_match_winner_focus`: totals, spreads, exact-score, halftime, and prop-style markets were excluded from the main slate.
- `max_events_reached` and `max_import_reached`: caps prevented a broader import.
- `already_exists_locally`: existing local markets were not duplicated.
- `esports_not_supported`: esports-like entries were blocked.

Detected remote sports included soccer plus basketball, MLB, NHL, and other
items. Detected market types included match winner, draw/generic yes-no, totals,
spreads, exact score, halftime leader, and player props.

Recommendation: this dry-run is suitable for a supervised add-only apply if the
operator wants to expand soccer coverage. Keep the same conservative caps:

- sport: soccer only
- window: next 7 days
- remote pages: 5
- event cap: 10
- market cap: 30
- snapshot cap: 30
- scoring cap: 30
- no `--delete-existing`
- no trading

Apply command for a future supervised session, not executed during this review:

```powershell
.\.venv\Scripts\python.exe -m app.commands.refresh_soccer_markets --apply --yes-i-understand-this-writes-data --days 7 --pages 5 --limit 50 --max-events 10 --max-import 30 --max-snapshots 30 --score-limit 30 --json --debug-skips
```

Rollback approach if a supervised import is later judged wrong: do not truncate
tables. Identify newly created soccer events and markets from the apply output,
then remove only those records and their dependent snapshots/predictions in a
reviewed transaction.

## Supervised Soccer Apply Record

Run completed: 2026-05-08 01:39:42 UTC to 2026-05-08 01:40:08 UTC.

Command executed once:

```powershell
.\.venv\Scripts\python.exe -m app.commands.refresh_soccer_markets --days 7 --limit 50 --apply --yes-i-understand-this-writes-data --json
```

Safety confirmations:

- Add-only soccer refresh.
- `--delete-existing` was not used.
- No deletes, truncates, migrations, scheduler changes, or trading commands.
- Limits were not expanded from the approved command.
- Apply was executed once.

Result:

- Events created: 9.
- Markets created/imported: 25.
- Snapshots created: 25.
- Predictions created: 15.
- Scoring candidates skipped: 15 because they still lacked snapshots.
- Snapshot skips: 21, mainly existing/unchanged local candidates.

Counts before:

- Events total: 18.
- Markets total: 50.
- Snapshots total: 35.
- Predictions total: 35.
- Soccer events: 18.
- Soccer markets: 50.
- Soccer snapshots: 35.
- Soccer predictions: 35.

Counts after:

- Events total: 27.
- Markets total: 75.
- Snapshots total: 60.
- Predictions total: 50.
- Soccer events: 27.
- Soccer markets: 75.
- Soccer snapshots: 60.
- Soccer predictions: 50.

Post-apply public verification:

- Backend/proxy soccer overview with `limit=50`: `total_count=75`, `items_length=50`.
- `/sports/soccer` returned HTTP 200.
- Production smoke passed with `match_card_count=16`.

Follow-up recommendation: keep the next refresh add-only and supervised until
the remaining snapshot gaps are understood. If the UI should display more than
50 visible markets at once, change the frontend limit and smoke expectations in
a separate product sprint.

## Soccer Refresh V2 Readiness Review

Review date: 2026-05-08.

Dry-run command executed, without `--apply`:

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m app.commands.refresh_soccer_markets --days 7 --limit 100 --report-json N:\projects\polimarket\logs\reports\dry-runs\soccer-refresh-dry-run-limit-100.json --json --debug-skips
```

Important context: this run used the locally configured read-only runtime
database because `DATABASE_URL` was not loaded in the shell. Before any future
write, rerun the same dry-run after pasting the Neon pooled `DATABASE_URL` in a
private PowerShell session and confirm the candidate/duplicate counts again.

Dry-run result:

- `dry_run=true`, `apply=false`, `read_only=true`.
- Candidate events: 10.
- Candidate markets: 25.
- `would_import`: 25.
- Skipped: 4,316.
- Snapshot candidates: 25.
- Scoring candidates: 0.
- `apply_readiness.ready=true`, `recommended=true` for the candidate slate.
- Duplicate count in the configured local database: 597.
- Risk count: 9, all `esports_not_supported`.

Candidate matches included:

- Racing Club de Lens vs FC Nantes.
- Club Atletico de Madrid vs RC Celta de Vigo.
- BV Borussia 09 Dortmund vs Eintracht Frankfurt.
- Manchester City FC vs Brentford FC.
- Fulham FC vs AFC Bournemouth.
- Liverpool FC vs Chelsea FC.
- Torino FC vs US Sassuolo Calcio.
- Brighton & Hove Albion FC vs Wolverhampton Wanderers FC.
- Sunderland AFC vs Manchester United FC.
- VfL Wolfsburg vs FC Bayern Munchen.

Main skip reasons:

- `sport_filter_mismatch`: non-soccer entries stayed out.
- `not_match_winner_focus`: exact-score, totals, spreads, halftime and props
  stayed out of the main slate.
- `already_exists_locally`: local duplicates were not selected.
- `max_events_reached` and `max_import_reached`: caps prevented a broad import.
- `esports_not_supported`: esports examples were blocked.

Production public health was checked through the frontend proxy, read-only:

- Soccer total: 75.
- Loaded by paginated overview: 75.
- With snapshot/update: 60.
- With prediction/analysis: 50.
- Active: 75.
- Closed: 0.
- Updated in the last 48 hours: 25.
- Stale or missing recent update: 50.
- With visible price/liquidity/volume: 60.
- Latest seen update: 2026-05-08T01:39:42Z.

Follow-up proxy check on 2026-05-09 recalculated the rolling 48-hour window as
25 recent and 50 stale/missing recent update. That drift is expected when no
new snapshots are created.

Recommended next step: run a Neon-backed dry-run in a supervised session before
any apply. If the Neon dry-run is similar, an add-only apply can use the same
caps: `days=7`, `pages=5`, `limit=100`, `max-events=10`, `max-import=30`,
`max-snapshots=30`, `score-limit=30`.

Apply command for a future supervised session, not executed in this review:

```powershell
# NO EJECUTADO
.\.venv\Scripts\python.exe -m app.commands.refresh_soccer_markets --apply --yes-i-understand-this-writes-data --days 7 --pages 5 --limit 100 --max-events 10 --max-import 30 --max-snapshots 30 --score-limit 30 --json --debug-skips
```

Stop conditions before any apply:

- Any selected esports or wrong-sport market.
- Too many closed or same-day-expired markets.
- Missing prices for primary markets.
- Unexpected jump in `would_import`.
- Proxy/backend errors in `/markets/overview`.
- Any need for `--delete-existing`.

## Freshness Refresh V2 Plan

Plan A is to refresh existing soccer markets before importing more events. The
goal is add-only freshness coverage for missing or stale snapshots, not a
replacement import.

Because local Codex currently resolves to localhost, production dry-runs must
run from an approved environment that already has the Neon runtime database
configured, such as a Render shell/one-off job or a manually triggered GitHub
Actions job with existing secrets. The mandatory preflight is:

```powershell
.\.venv\Scripts\python.exe -m app.commands.check_database_config --connect
```

Continue only if the output is masked, `connection_status=ok`, and
`looks_like_neon=true`. Stop immediately if it reports localhost, missing
configuration, or an unexpected provider.

Current status of existing snapshot refresh tooling:

- `refresh_existing_soccer_markets` is the no-write readiness command for
  existing soccer markets.
- It is dry-run by default and reports snapshot/analyis candidates without
  importing new markets.
- It does not delete data, does not trade, does not run migrations, and does
  not print connection strings.
- `--apply` is parsed but intentionally blocked for now, even with
  `--yes-i-understand-this-writes-data`, until a supervised write path is
  reviewed separately.
- The older `refresh_market_snapshots` command can evaluate existing markets,
  but its command-level dry-run records refresh-run audit rows. Do not use that
  command for a "no writes at all" Neon diagnostic.

Local Codex dry-run, executed against localhost only:

```powershell
.\.venv\Scripts\python.exe -m app.commands.refresh_existing_soccer_markets --limit 25 --stale-hours 48 --report-json N:\projects\polimarket\logs\reports\dry-runs\existing-soccer-refresh-local-dry-run.json --json
```

Result: local database had `total_existing_markets=0`, so it found no
candidates. This confirms command wiring only; it is not production evidence.

First real production dry-run, not executed:

```powershell
# NO EJECUTADO
.\.venv\Scripts\python.exe -m app.commands.refresh_existing_soccer_markets --sport soccer --limit 25 --stale-hours 48 --report-json N:\projects\polimarket\logs\reports\dry-runs\existing-soccer-refresh-neon-dry-run.json --json
```

Future supervised apply shape, not executed and currently blocked in code:

```powershell
# NO EJECUTADO
.\.venv\Scripts\python.exe -m app.commands.refresh_existing_soccer_markets --apply --yes-i-understand-this-writes-data --sport soccer --limit 25 --stale-hours 48 --json
```

Plan B is to import more soccer markets only after a Neon-backed
`refresh_soccer_markets` dry-run recommends it. Keep the run add-only and use
the reviewed caps. Never combine it with `--delete-existing`.

Post-refresh validation for either plan:

- `npm.cmd --workspace apps/web run smoke:production`.
- Open `/internal/data-status` and confirm "Solo lectura" plus soccer freshness
  metrics.
- Open `/sports/soccer` and confirm total count, match cards, filters, and
  market detail links.
- Check backend/proxy soccer overview for `total_count`.
- Confirm snapshots and predictions changed only in the intended sport.

Risks to review before any write:

- Remote candidates that are esports or wrong-sport markets.
- Closed, expired, or no-price markets.
- Stale data that looks active in one source but not another.
- Proxy timeouts when requesting too many overview rows at once.
- Partial scoring because some markets still lack snapshots.

Logical rollback remains record-based: do not truncate tables. If a supervised
write imports bad candidates, identify the created soccer records from the
apply output and review a narrow transaction plan before removing anything.

## Scheduler Options

- Render Cron Job: best once the apply command is trusted and guarded by
  environment variables.
- GitHub Actions: acceptable for manual `workflow_dispatch`; do not enable a
  scheduled trigger until the dry-run/apply audit flow is stable.
- Manual command: preferred during MVP because every write is reviewed.

Recommended initial cadence after approval: dry-run every few hours, supervised
apply once or twice daily while market coverage is being tuned.

## Verification

After any supervised apply:

```powershell
curl "https://polisygnal.onrender.com/markets/overview?sport_type=soccer&limit=50"
curl "https://polisygnal-web.vercel.app/api/backend/markets/overview?sport_type=soccer&limit=50"
npm.cmd --workspace apps/web run smoke:production
```

Expected public behavior: `/sports/soccer` shows current soccer markets,
grouped by match, with visible update controls and no internal diagnostics.
