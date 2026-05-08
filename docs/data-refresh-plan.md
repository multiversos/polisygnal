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
- Updated in the last 48 hours: 45.
- Stale or missing recent update: 30.
- With visible price/liquidity/volume: 60.
- Latest seen update: 2026-05-08T01:39:42Z.

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
