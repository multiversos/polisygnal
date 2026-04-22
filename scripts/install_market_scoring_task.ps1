[CmdletBinding()]
param(
    [string]$TaskName = "PolySignal-Market-Scoring",
    [int]$EveryMinutes = 120,
    [int]$Limit = 0,
    [string]$LogDir = "",
    [switch]$RunAfterCreate
)

$ErrorActionPreference = "Stop"

if ($EveryMinutes -lt 1) {
    throw "EveryMinutes debe ser mayor o igual a 1."
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$runnerScript = Join-Path $repoRoot "scripts\run_market_scoring.ps1"
if (-not (Test-Path -LiteralPath $runnerScript)) {
    throw "No existe el wrapper de scoring: $runnerScript"
}

if ([string]::IsNullOrWhiteSpace($LogDir)) {
    $LogDir = Join-Path $repoRoot "logs\market_scoring"
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$powerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$taskCommand = "$powerShellExe -NoProfile -ExecutionPolicy Bypass -File `"$runnerScript`""
if ($Limit -gt 0) {
    $taskCommand += " -Limit $Limit"
}
$taskCommand += " -LogDir `"$LogDir`""

$createOutput = schtasks /Create /TN $TaskName /SC MINUTE /MO $EveryMinutes /TR $taskCommand /F 2>&1
$createExitCode = $LASTEXITCODE
if ($createExitCode -ne 0) {
    $createText = ($createOutput | Out-String).Trim()
    throw "No se pudo crear o actualizar la tarea programada. $createText"
}

Write-Host ($createOutput | Out-String).Trim()
Write-Host "Task name: $TaskName"
Write-Host "Frequency minutes: $EveryMinutes"
Write-Host "Limit: $(if ($Limit -gt 0) { $Limit } else { 'sin limite' })"
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
