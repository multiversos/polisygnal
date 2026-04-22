[CmdletBinding()]
param(
    [string]$TaskName = "PolySignal-Market-Reports",
    [int]$EveryMinutes = 120,
    [int]$Limit = 50,
    [string]$PresetsCsv = "top_opportunities,watchlist,evidence_backed,fallback_only",
    [string]$FormatsCsv = "json,csv",
    [string]$LogDir = "",
    [switch]$RunAfterCreate
)

$ErrorActionPreference = "Stop"

if ($EveryMinutes -lt 1) {
    throw "EveryMinutes debe ser mayor o igual a 1."
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$runnerScript = Join-Path $repoRoot "scripts\run_market_reports.ps1"
if (-not (Test-Path -LiteralPath $runnerScript)) {
    throw "No existe el wrapper de reportes: $runnerScript"
}

if ([string]::IsNullOrWhiteSpace($LogDir)) {
    $LogDir = Join-Path $repoRoot "logs\reports"
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$powerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$taskCommand = "$powerShellExe -NoProfile -ExecutionPolicy Bypass -File `"$runnerScript`""
if ($Limit -ne 50) {
    $taskCommand += " -Limit $Limit"
}
if ($LogDir -ne (Join-Path $repoRoot "logs\reports")) {
    $taskCommand += " -LogDir `"$LogDir`""
}
if ($PresetsCsv -ne "top_opportunities,watchlist,evidence_backed,fallback_only") {
    $taskCommand += " -PresetsCsv `"$PresetsCsv`""
}
if ($FormatsCsv -ne "json,csv") {
    $taskCommand += " -FormatsCsv `"$FormatsCsv`""
}

$createOutput = schtasks /Create /TN $TaskName /SC MINUTE /MO $EveryMinutes /TR $taskCommand /F 2>&1
$createExitCode = $LASTEXITCODE
if ($createExitCode -ne 0) {
    $createText = ($createOutput | Out-String).Trim()
    throw "No se pudo crear o actualizar la tarea programada. $createText"
}

Write-Host ($createOutput | Out-String).Trim()
Write-Host "Task name: $TaskName"
Write-Host "Frequency minutes: $EveryMinutes"
Write-Host "Limit: $Limit"
Write-Host "Presets: $PresetsCsv"
Write-Host "Formats: $FormatsCsv"
Write-Host "Log dir: $LogDir"

if ($RunAfterCreate) {
    $runOutput = schtasks /Run /TN $TaskName 2>&1
    $runExitCode = $LASTEXITCODE
    if ($runExitCode -ne 0) {
        $runText = ($runOutput | Out-String).Trim()
        throw "La tarea se creo, pero no se pudo ejecutar manualmente. $runText"
    }
    Write-Host ($runOutput | Out-String).Trim()
}
