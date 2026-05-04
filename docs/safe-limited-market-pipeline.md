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

## Snapshot Dry-Run

Only for sports where import dry-run shows viable candidates:

```powershell
.\.venv\Scripts\python.exe -m app.commands.create_snapshots_from_discovery --dry-run --sport <sport> --days 30 --limit 100 --max-snapshots 10 --json
```

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
