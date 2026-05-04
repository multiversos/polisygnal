[CmdletBinding()]
param(
    [int]$Limit = 25,
    [string]$SportType = "",
    [string]$MarketType = "",
    [switch]$DryRun,
    [string]$PythonPath = "",
    [string]$ApiDir = "",
    [string]$LogDir = ""
)

$ErrorActionPreference = "Stop"

function Get-PayloadValue {
    param(
        [Parameter(Mandatory = $true)]
        $Payload,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if ($null -eq $Payload) {
        return $null
    }

    $property = $Payload.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }

    return $property.Value
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
if ([string]::IsNullOrWhiteSpace($ApiDir)) {
    $ApiDir = Join-Path $repoRoot "apps\api"
}
if ([string]::IsNullOrWhiteSpace($PythonPath)) {
    $PythonPath = Join-Path $ApiDir ".venv\Scripts\python.exe"
}
if ([string]::IsNullOrWhiteSpace($LogDir)) {
    $LogDir = Join-Path $repoRoot "logs\market_scoring"
}

if (-not (Test-Path -LiteralPath $ApiDir)) {
    throw "No existe el directorio de la API: $ApiDir"
}
if (-not (Test-Path -LiteralPath $PythonPath)) {
    throw "No existe el ejecutable de Python esperado: $PythonPath"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startedAt = Get-Date
$runId = $startedAt.ToString("yyyyMMdd_HHmmss")
$rawOutputPath = Join-Path $LogDir "$runId.command-output.txt"
$summaryPath = Join-Path $LogDir "$runId.summary.json"
$latestSummaryPath = Join-Path $LogDir "latest-summary.json"
$historyPath = Join-Path $LogDir "runs.log"

$commandArgs = @("-m", "app.commands.score_missing_markets", "--limit", $Limit.ToString(), "--json")
if (-not [string]::IsNullOrWhiteSpace($SportType)) {
    $commandArgs += "--sport-type"
    $commandArgs += $SportType
}
if (-not [string]::IsNullOrWhiteSpace($MarketType)) {
    $commandArgs += "--market-type"
    $commandArgs += $MarketType
}
if ($DryRun) {
    $commandArgs += "--dry-run"
}
else {
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

$finishedAt = Get-Date
$durationSeconds = [math]::Round(($finishedAt - $startedAt).TotalSeconds, 3)
$rawOutputText = ($commandOutput | Out-String).Trim()
$rawOutputText | Set-Content -Path $rawOutputPath -Encoding utf8

$commandPayload = $null
$parseError = $null
if (-not [string]::IsNullOrWhiteSpace($rawOutputText)) {
    try {
        $commandPayload = $rawOutputText | ConvertFrom-Json
    }
    catch {
        $parseError = $_.Exception.Message
    }
}

$partialErrorCount = $null
if ($commandPayload) {
    $explicitPartialErrorCount = Get-PayloadValue -Payload $commandPayload -Name "partial_error_count"
    if ($null -ne $explicitPartialErrorCount) {
        $partialErrorCount = [int]$explicitPartialErrorCount
    }
    else {
        $partialErrors = Get-PayloadValue -Payload $commandPayload -Name "partial_errors"
        if ($null -ne $partialErrors) {
            $partialErrorCount = @($partialErrors).Count
        }
    }
}

$status = "error"
if ($exitCode -eq 0 -and $commandPayload) {
    if ($partialErrorCount -gt 0) {
        $status = "warning"
    }
    else {
        $status = "ok"
    }
}

$predictionsCreated = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "predictions_created" } else { $null })
$predictionsUpdated = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "predictions_updated" } else { $null })
$marketsConsidered = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_considered" } else { $null })
$marketsScored = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_scored" } else { $null })
$marketsScoredWithAnyEvidence = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_scored_with_any_evidence" } else { $null })
$marketsScoredWithOddsEvidence = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_scored_with_odds_evidence" } else { $null })
$marketsScoredWithNewsEvidence = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_scored_with_news_evidence" } else { $null })
$marketsScoredWithSnapshotFallback = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_scored_with_snapshot_fallback" } else { $null })
$usedOddsCount = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "used_odds_count" } else { $null })
$usedNewsCount = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "used_news_count" } else { $null })

$summary = [ordered]@{
    status = $status
    started_at = $startedAt.ToString("o")
    finished_at = $finishedAt.ToString("o")
    duration_seconds = $durationSeconds
    repo_root = $repoRoot
    api_dir = $ApiDir
    python_path = $PythonPath
    log_dir = $LogDir
    limit = $(if ($Limit -gt 0) { $Limit } else { $null })
    exit_code = $exitCode
    markets_considered = $marketsConsidered
    markets_scored = $marketsScored
    predictions_created = $predictionsCreated
    predictions_updated = $(if ($null -ne $predictionsUpdated) { $predictionsUpdated } else { 0 })
    markets_scored_with_any_evidence = $marketsScoredWithAnyEvidence
    markets_scored_with_odds_evidence = $marketsScoredWithOddsEvidence
    markets_scored_with_news_evidence = $marketsScoredWithNewsEvidence
    markets_scored_with_snapshot_fallback = $marketsScoredWithSnapshotFallback
    used_odds_count = $usedOddsCount
    used_news_count = $usedNewsCount
    partial_error_count = $partialErrorCount
    raw_output_path = $rawOutputPath
    parse_error = $parseError
    command_payload = $commandPayload
}

$summaryJson = $summary | ConvertTo-Json -Depth 10
$summaryJson | Set-Content -Path $summaryPath -Encoding utf8
$summaryJson | Set-Content -Path $latestSummaryPath -Encoding utf8

$historyLine = "{0}`t{1}`tconsidered={2}`tscored={3}`twith_evidence={4}`tfallback={5}`tcreated={6}`tupdated={7}`tpartial_errors={8}`texit={9}" -f `
    $startedAt.ToString("o"), `
    $status, `
    $(if ($null -ne $marketsConsidered) { $marketsConsidered } else { "" }), `
    $(if ($null -ne $marketsScored) { $marketsScored } else { "" }), `
    $(if ($null -ne $marketsScoredWithAnyEvidence) { $marketsScoredWithAnyEvidence } else { "" }), `
    $(if ($null -ne $marketsScoredWithSnapshotFallback) { $marketsScoredWithSnapshotFallback } else { "" }), `
    $(if ($null -ne $predictionsCreated) { $predictionsCreated } else { "" }), `
    $(if ($null -ne $predictionsUpdated) { $predictionsUpdated } else { 0 }), `
    $(if ($null -ne $partialErrorCount) { $partialErrorCount } else { "" }), `
    $exitCode
Add-Content -Path $historyPath -Value $historyLine -Encoding utf8

Write-Host "Scoring run: $status"
Write-Host "Started at: $($startedAt.ToString("o"))"
Write-Host "Finished at: $($finishedAt.ToString("o"))"
Write-Host "Duration seconds: $durationSeconds"
if ($commandPayload) {
    Write-Host "Markets considered: $marketsConsidered"
    Write-Host "Markets scored: $marketsScored"
    Write-Host "Markets scored with any evidence: $marketsScoredWithAnyEvidence"
    Write-Host "Markets scored with odds evidence: $marketsScoredWithOddsEvidence"
    Write-Host "Markets scored with news evidence: $marketsScoredWithNewsEvidence"
    Write-Host "Markets scored with snapshot fallback: $marketsScoredWithSnapshotFallback"
    Write-Host "Predictions created: $predictionsCreated"
    Write-Host "Predictions updated: $(if ($null -ne $predictionsUpdated) { $predictionsUpdated } else { 0 })"
    Write-Host "Odds evidence items used: $usedOddsCount"
    Write-Host "News evidence items used: $usedNewsCount"
    Write-Host "Partial errors: $partialErrorCount"
}
Write-Host "Summary log: $summaryPath"

if ($status -eq "error") {
    if ($parseError) {
        Write-Error "No se pudo parsear la salida JSON del comando: $parseError"
    }
    elseif ($rawOutputText) {
        Write-Error $rawOutputText
    }
    exit 1
}

exit 0
