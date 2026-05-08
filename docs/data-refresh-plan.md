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
