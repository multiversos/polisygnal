[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$SourcePath = "",
    [string]$PythonPath = "",
    [string]$ApiDir = "",
    [string]$LogDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
if ([string]::IsNullOrWhiteSpace($ApiDir)) {
    $ApiDir = Join-Path $repoRoot "apps\api"
}
if ([string]::IsNullOrWhiteSpace($PythonPath)) {
    $PythonPath = Join-Path $ApiDir ".venv\Scripts\python.exe"
}
if ([string]::IsNullOrWhiteSpace($LogDir)) {
    $LogDir = Join-Path $repoRoot "logs\linear_sync"
}
if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    $SourcePath = Join-Path $repoRoot "docs\linear-project-board.json"
}

if (-not (Test-Path -LiteralPath $ApiDir)) {
    throw "No existe el directorio de la API: $ApiDir"
}
if (-not (Test-Path -LiteralPath $PythonPath)) {
    throw "No existe el ejecutable de Python esperado: $PythonPath"
}
if (-not (Test-Path -LiteralPath $SourcePath)) {
    throw "No existe el archivo canonico de Linear: $SourcePath"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startedAt = Get-Date
$runId = $startedAt.ToString("yyyyMMdd_HHmmss")
$summaryPath = Join-Path $LogDir "$runId.summary.json"
$latestSummaryPath = Join-Path $LogDir "latest-summary.json"
$historyPath = Join-Path $LogDir "runs.log"
$rawOutputPath = Join-Path $LogDir "$runId.command-output.txt"

$commandArgs = @(
    "-m", "app.commands.sync_linear",
    "--source-path", $SourcePath
)
if ($Apply) {
    $commandArgs += "--apply"
}

Push-Location $ApiDir
try {
    $commandOutput = & $PythonPath @commandArgs 2>&1
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

$rawOutputText = ($commandOutput | Out-String).Trim()
$rawOutputText | Set-Content -Path $rawOutputPath -Encoding utf8

$payload = $null
$parseError = $null
if (-not [string]::IsNullOrWhiteSpace($rawOutputText)) {
    try {
        $payload = $rawOutputText | ConvertFrom-Json
    }
    catch {
        $parseError = $_.Exception.Message
    }
}

$status = "error"
if ($exitCode -eq 0 -and $payload -and $payload.status -eq "ok") {
    $status = "ok"
}

$summary = [ordered]@{
    status = $status
    mode = $(if ($Apply) { "apply" } else { "dry_run" })
    started_at = $startedAt.ToString("o")
    finished_at = (Get-Date).ToString("o")
    repo_root = $repoRoot
    api_dir = $ApiDir
    python_path = $PythonPath
    source_path = $SourcePath
    log_dir = $LogDir
    exit_code = $exitCode
    raw_output_path = $rawOutputPath
    parse_error = $parseError
    team_id = $(if ($payload) { $payload.team_id } else { $null })
    team_name = $(if ($payload) { $payload.team_name } else { $null })
    project_id = $(if ($payload) { $payload.project_id } else { $null })
    issues_total = $(if ($payload) { $payload.issues_total } else { $null })
    summary = $(if ($payload) { $payload.summary } else { $null })
    operations = $(if ($payload) { $payload.operations } else { $null })
    applied_operations = $(if ($payload) { $payload.applied_operations } else { $null })
}

$summaryJson = $summary | ConvertTo-Json -Depth 10
$summaryJson | Set-Content -Path $summaryPath -Encoding utf8
$summaryJson | Set-Content -Path $latestSummaryPath -Encoding utf8

$historyLine = "{0}`t{1}`tmode={2}`tteam={3}`tcreate={4}`tupdate={5}`tunchanged={6}`tapplied={7}" -f `
    $startedAt.ToString("o"), `
    $status, `
    $(if ($Apply) { "apply" } else { "dry_run" }), `
    $(if ($payload) { $payload.team_name } else { "" }), `
    $(if ($payload -and $payload.summary) { $payload.summary.to_create } else { "" }), `
    $(if ($payload -and $payload.summary) { $payload.summary.to_update } else { "" }), `
    $(if ($payload -and $payload.summary) { $payload.summary.unchanged } else { "" }), `
    $(if ($payload -and $payload.summary) { $payload.summary.applied } else { "" })
Add-Content -Path $historyPath -Value $historyLine -Encoding utf8

Write-Host "Linear sync: $status"
Write-Host "Mode: $(if ($Apply) { "apply" } else { "dry_run" })"
Write-Host "Source: $SourcePath"
Write-Host "Summary log: $summaryPath"

if ($payload -and $payload.summary) {
    Write-Host "To create: $($payload.summary.to_create)"
    Write-Host "To update: $($payload.summary.to_update)"
    Write-Host "Unchanged: $($payload.summary.unchanged)"
    Write-Host "Applied: $($payload.summary.applied)"
}

if ($status -eq "error") {
    exit 1
}

exit 0
