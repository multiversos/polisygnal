[CmdletBinding()]
param(
    [int]$Limit = 0,
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
    $LogDir = Join-Path $repoRoot "logs\market_evidence"
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

$commandArgs = @("-m", "app.commands.capture_nba_winner_evidence")
if ($Limit -gt 0) {
    $commandArgs += "--limit"
    $commandArgs += $Limit.ToString()
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
    markets_considered = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_considered" } else { $null })
    markets_eligible_for_evidence = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_eligible_for_evidence" } else { $null })
    markets_processed = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_processed" } else { $null })
    markets_matchup_shape = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_matchup_shape" } else { $null })
    markets_futures_shape = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_futures_shape" } else { $null })
    markets_ambiguous_shape = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_ambiguous_shape" } else { $null })
    markets_skipped_non_matchable = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_skipped_non_matchable" } else { $null })
    markets_skipped_unsupported_shape = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_skipped_unsupported_shape" } else { $null })
    sources_created = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "sources_created" } else { $null })
    sources_updated = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "sources_updated" } else { $null })
    evidence_created = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "evidence_created" } else { $null })
    evidence_updated = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "evidence_updated" } else { $null })
    markets_with_odds_match = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_with_odds_match" } else { $null })
    markets_with_news_match = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_with_news_match" } else { $null })
    odds_matches = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "odds_matches" } else { $null })
    odds_missing_api_key = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "odds_missing_api_key" } else { $null })
    odds_no_match = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "odds_no_match" } else { $null })
    news_items_matched = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "news_items_matched" } else { $null })
    partial_error_count = $partialErrorCount
    raw_output_path = $rawOutputPath
    parse_error = $parseError
    command_payload = $commandPayload
}

$summaryJson = $summary | ConvertTo-Json -Depth 10
$summaryJson | Set-Content -Path $summaryPath -Encoding utf8
$summaryJson | Set-Content -Path $latestSummaryPath -Encoding utf8

$historyLine = "{0}`t{1}`tconsidered={2}`teligible={3}`tskipped_non_matchable={4}`tskipped_unsupported={5}`tprocessed={6}`tevidence_created={7}`tpartial_errors={8}`texit={9}" -f `
    $startedAt.ToString("o"), `
    $status, `
    $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_considered" } else { "" }), `
    $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_eligible_for_evidence" } else { "" }), `
    $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_skipped_non_matchable" } else { "" }), `
    $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_skipped_unsupported_shape" } else { "" }), `
    $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_processed" } else { "" }), `
    $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "evidence_created" } else { "" }), `
    $(if ($null -ne $partialErrorCount) { $partialErrorCount } else { "" }), `
    $exitCode
Add-Content -Path $historyPath -Value $historyLine -Encoding utf8

Write-Host "Evidence run: $status"
Write-Host "Started at: $($startedAt.ToString("o"))"
Write-Host "Finished at: $($finishedAt.ToString("o"))"
Write-Host "Duration seconds: $durationSeconds"
if ($commandPayload) {
    Write-Host "Markets considered: $(Get-PayloadValue -Payload $commandPayload -Name "markets_considered")"
    Write-Host "Markets eligible for evidence: $(Get-PayloadValue -Payload $commandPayload -Name "markets_eligible_for_evidence")"
    Write-Host "Markets processed: $(Get-PayloadValue -Payload $commandPayload -Name "markets_processed")"
    Write-Host "Skipped non-matchable: $(Get-PayloadValue -Payload $commandPayload -Name "markets_skipped_non_matchable")"
    Write-Host "Skipped unsupported shape: $(Get-PayloadValue -Payload $commandPayload -Name "markets_skipped_unsupported_shape")"
    Write-Host "Sources created: $(Get-PayloadValue -Payload $commandPayload -Name "sources_created")"
    Write-Host "Sources updated: $(Get-PayloadValue -Payload $commandPayload -Name "sources_updated")"
    Write-Host "Evidence created: $(Get-PayloadValue -Payload $commandPayload -Name "evidence_created")"
    Write-Host "Evidence updated: $(Get-PayloadValue -Payload $commandPayload -Name "evidence_updated")"
    Write-Host "Markets with odds match: $(Get-PayloadValue -Payload $commandPayload -Name "markets_with_odds_match")"
    Write-Host "Markets with news match: $(Get-PayloadValue -Payload $commandPayload -Name "markets_with_news_match")"
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
