# Safe Limited Market Pipeline

This document describes the safe dry-run flow for preparing market coverage.
It must not write to Neon unless an operator explicitly changes the command to
`--apply` after reviewing dry-run output.

## Guardrails

- Do not store database URLs in files.
- Do not print full connection strings.
- Do not run imports without an explicit limit.
- Do not run discovery/import/scoring for secondary sports: `ufc`, `cricket`, `nhl`.
- Do not run trading or automated orders.
- Prefer `DATABASE_URL` for local operational commands only when pasted privately in PowerShell.

## Temporary PowerShell Environment

Paste secrets only into the current terminal session:

```powershell
$env:POLYSIGNAL_ENV = "production"
$secureDatabaseUrl = Read-Host "Paste Neon pooled DATABASE_URL" -AsSecureString
$env:DATABASE_URL = [System.Net.NetworkCredential]::new("", $secureDatabaseUrl).Password
```

Check configuration without printing secrets:

```powershell
cd N:\projects\polimarket\apps\api
.\.venv\Scripts\python.exe -m app.commands.check_database_config --connect
```

## Dry-Run Flow

For each primary sport, run discovery/import dry-run with explicit caps:

```powershell
.\.venv\Scripts\python.exe -m app.commands.import_live_discovered_markets --dry-run --sport soccer --days 30 --limit 100 --max-import 10 --json
.\.venv\Scripts\python.exe -m app.commands.import_live_discovered_markets --dry-run --sport basketball --days 30 --limit 100 --max-import 10 --json
.\.venv\Scripts\python.exe -m app.commands.import_live_discovered_markets --dry-run --sport nfl --days 30 --limit 100 --max-import 10 --json
.\.venv\Scripts\python.exe -m app.commands.import_live_discovered_markets --dry-run --sport tennis --days 30 --limit 100 --max-import 10 --json
.\.venv\Scripts\python.exe -m app.commands.import_live_discovered_markets --dry-run --sport baseball --days 30 --limit 100 --max-import 10 --json
.\.venv\Scripts\python.exe -m app.commands.import_live_discovered_markets --dry-run --sport horse_racing --days 30 --limit 100 --max-import 10 --json
```

If dry-run reports `would_import=0`, stop for that sport. That is not an error.
Use `--debug-skips` when you need to understand why candidates were rejected:

```powershell
.\.venv\Scripts\python.exe -m app.commands.import_live_discovered_markets --dry-run --sport soccer --days 30 --limit 100 --max-import 10 --json --debug-skips
```

The debug output includes `skip_reasons_count`, up to three truncated
`skip_examples` per reason, `detected_sports_count`,
`detected_market_types_count`, and the requested parameters. The `--limit`
value currently clamps the remote events page size, not the flattened market
count; `total_remote_checked` can be higher because one event can contain many
markets.

For import dry-runs, treat `--limit` as a remote event/page guard and
`--max-import` as the cap on markets that could be written if the command were
changed to `--apply`. Do not interpret `--limit 100` as "review exactly 100
remote markets"; one remote event can carry many markets.

## Soccer Upcoming Games Dry-Run

For soccer, use event-limited dry-run before any import. This reads more remote
`/events` pages, groups markets by match, and caps the number of games before
the market cap is applied:

```powershell
.\.venv\Scripts\python.exe -m app.commands.import_live_discovered_markets --dry-run --sport soccer --days 3 --pages 5 --max-events 3 --max-import 10 --json --debug-skips
```

Interpretation:

- `--pages` controls how many remote Polymarket `/events` pages are read.
- `--max-events` / `--max-games` limits event or match groups.
- `--max-import` still limits individual markets inside the selected events.
- For soccer game groups, primary markets are team A win, draw when present,
  and team B win.
- Exact score, halftime, totals, spreads, and player props are secondary
  markets and should not drive the main import decision.

Review `event_groups` first. It should show `event_slug`, teams, close time,
draw availability, `primary_markets`, `secondary_markets_count`, and
`would_import_markets_count`. Do not switch to `--apply` until the dry-run
clearly matches the intended upcoming games.

## Soccer Refresh Orchestrator

Use the orchestrator when you want one safe summary instead of manually running
import, snapshot, and scoring dry-runs one by one:

```powershell
.\.venv\Scripts\python.exe -m app.commands.refresh_soccer_markets --dry-run --days 7 --pages 5 --max-events 10 --max-import 30 --max-snapshots 30 --score-limit 30 --json --debug-skips
```

To save a local dry-run report for review, add `--report-json`:

```powershell
.\.venv\Scripts\python.exe -m app.commands.refresh_soccer_markets --dry-run --days 7 --pages 5 --max-events 10 --max-import 30 --max-snapshots 30 --score-limit 30 --json --debug-skips --report-json N:\projects\_polysignal_backups\refresh-soccer-dry-run.json
```

The report is dry-run only and redacts secret-like fields defensively. Do not
commit local reports.

The dry-run report includes an `apply_readiness` section:

- `ready`: whether the current candidate slate is structurally usable.
- `recommended`: whether the current caps look safe for a supervised add-only
  apply.
- `safe_candidate_count`: markets that would be imported.
- `duplicate_count`: markets already present in the configured database.
- `risky_candidate_count` and `top_risks`: blocked candidates such as esports,
  unsupported sports, closed markets, or missing prices.
- `recommended_limits`: the exact reviewed caps.
- `recommended_next_command_dry_run`: command to rerun before any write.
- `recommended_apply_command_marked_do_not_run`: an apply command clearly
  marked for a future supervised session only.

If the shell is not pointed at Neon, treat duplicate/readiness counts as local
diagnostics only. Rerun with the Neon pooled `DATABASE_URL` pasted privately
before any supervised apply.

Default behavior is dry-run even if `--dry-run` is omitted. In dry-run, the
command:

- reads current local counts;
- runs soccer import discovery in dry-run;
- reports the backup/delete plan without deleting anything;
- runs snapshot discovery in dry-run;
- runs missing-market scoring in dry-run;
- prints `next_command_to_apply` for a supervised follow-up.

Review `candidate_events`, `candidate_markets`, `snapshot_would_create`, and
`scoring_candidates` before any apply. The apply command is intentionally
explicit and requires a second write-confirmation flag:

```powershell
.\.venv\Scripts\python.exe -m app.commands.refresh_soccer_markets --apply --yes-i-understand-this-writes-data --days 7 --pages 5 --max-events 10 --max-import 30 --max-snapshots 30 --score-limit 30 --json --debug-skips
```

`--delete-existing` is reserved for a future supervised refresh. It must not be
used until there is a soccer-only backup, an explicit confirmation flow, and a
tested transaction plan. The current orchestrator refuses to delete data.

## Snapshot Dry-Run

Only for sports where import dry-run shows viable candidates:

```powershell
.\.venv\Scripts\python.exe -m app.commands.create_snapshots_from_discovery --dry-run --sport <sport> --days 30 --limit 100 --max-snapshots 10 --json
```

When import used deeper Polymarket pages, snapshots should use the same
remote depth so newly imported events can be found again:

```powershell
.\.venv\Scripts\python.exe -m app.commands.create_snapshots_from_discovery --dry-run --sport soccer --days 7 --pages 5 --limit 100 --max-snapshots 30 --json
```

Use the matching `--pages` / `--max-pages` value from the reviewed import
dry-run. The default remains `1` for compatibility.

For existing local markets, `refresh_market_snapshots` can inspect potential
snapshot updates without importing new events:

```powershell
.\.venv\Scripts\python.exe -m app.commands.refresh_market_snapshots --dry-run --sport soccer --days 7 --limit 75 --json
```

This command is dry-run by default and requires explicit `--apply` before it
can save snapshots. However, the command-level dry-run records refresh-run audit
rows today, so it is not a strict no-write Neon diagnostic. For a future
production freshness operation, either run it only in a supervised write window
or first harden/create a no-audit read-only snapshot refresh command.

To inspect current soccer health without writing:

```powershell
.\.venv\Scripts\python.exe -m app.commands.inspect_soccer_market_health --json
```

It reports total soccer markets, with/without snapshot counts,
with/without prediction counts, active/closed counts, recent/stale counts,
missing price/liquidity/volume counts, top stale markets, top missing snapshot
markets, top missing prediction markets, and a short sample of markets that may
need refresh. It does not call imports, does not score, and does not write data.

Current soccer freshness baseline, reviewed 2026-05-09:

- 75 soccer markets.
- 60 with snapshots/updates and 15 without.
- 50 with predictions/analysis and 25 without.
- 75 active and 0 closed.
- 25 updated in the last 48 hours and 50 stale/missing recent update.
- 60 with visible price, liquidity, and volume.

Before any apply, confirm the shell is connected to Neon with masked output:

```powershell
.\.venv\Scripts\python.exe -m app.commands.check_database_config --connect
```

If the command reports localhost or `looks_like_neon=false`, do not use that
dry-run as authorization for a production apply.

Future strict no-write existing-snapshot refresh command to prepare, not
execute from a Neon-confirmed shell:

```powershell
# NO EJECUTADO
.\.venv\Scripts\python.exe -m app.commands.refresh_existing_soccer_markets --sport soccer --limit 25 --stale-hours 48 --report-json N:\projects\polimarket\logs\reports\dry-runs\existing-soccer-refresh-neon-dry-run.json --json
```

`refresh_existing_soccer_markets` is dry-run by default. It supports
`--missing-snapshot-only`, `--missing-prediction-only`, and `--stale-only` for
focused planning. `--apply` requires `--yes-i-understand-this-writes-data` and
is still blocked in code until a separate supervised write implementation is
approved.

For a manual GitHub Actions dry-run, use the workflow
`.github/workflows/soccer-refresh-dry-run.yml`. It is `workflow_dispatch` only,
has no schedule, does not pass `--apply`, does not pass the write-confirmation
flag, and writes only a dry-run report artifact. It expects the approved
`POLYSIGNAL_NEON_DATABASE_URL` repository secret to be configured. If that
secret is missing, the workflow fails before running the dry-run.

## Scoring Dry-Run

Only for markets that already exist and have snapshots:

```powershell
.\.venv\Scripts\python.exe -m app.commands.score_missing_markets --dry-run --sport-type <sport> --limit 10 --json
```

## Review Before Apply

Before any future apply run, capture:

- sport
- remote candidates checked
- `would_import`
- expected snapshots
- expected predictions
- exact command with limits
- confirmation that the sport is a primary active sport

Apply commands are intentionally omitted from this document.
