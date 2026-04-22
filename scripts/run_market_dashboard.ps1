[CmdletBinding()]
param(
    [string]$PythonPath = "",
    [string]$ApiDir = "",
    [string]$LogDir = "",
    [int]$TopLimit = 5,
    [int]$WatchlistLimit = 5
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

function Get-FileSizeBytes {
    param(
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }
    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    return (Get-Item -LiteralPath $Path).Length
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
if ([string]::IsNullOrWhiteSpace($ApiDir)) {
    $ApiDir = Join-Path $repoRoot "apps\api"
}
if ([string]::IsNullOrWhiteSpace($PythonPath)) {
    $PythonPath = Join-Path $ApiDir ".venv\Scripts\python.exe"
}
if ([string]::IsNullOrWhiteSpace($LogDir)) {
    $LogDir = Join-Path $repoRoot "logs\dashboard"
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
$summaryPath = Join-Path $LogDir "$runId.summary.json"
$latestSummaryPath = Join-Path $LogDir "latest-summary.json"
$historyPath = Join-Path $LogDir "runs.log"
$rawOutputPath = Join-Path $LogDir "$runId.command-output.txt"

$commandArgs = @(
    "-m", "app.commands.generate_dashboard",
    "--output-dir", $LogDir,
    "--top-limit", $TopLimit.ToString(),
    "--watchlist-limit", $WatchlistLimit.ToString()
)

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

$status = "warning"
$partialErrorCount = 1
$generatedAt = $null
$htmlOutputPath = $null
$latestHtmlPath = $null
$dashboardPath = $null
$overallStatus = $null
$totalTopOpportunities = $null
$topOpportunitiesRendered = $null
$totalWatchlist = $null
$watchlistRendered = $null
$evaluation = $null
$warningReason = $parseError

if ($exitCode -eq 0 -and $commandPayload -and (Get-PayloadValue -Payload $commandPayload -Name "status") -eq "ok") {
    $generatedAt = Get-PayloadValue -Payload $commandPayload -Name "generated_at"
    $htmlOutputPath = Get-PayloadValue -Payload $commandPayload -Name "html_output_path"
    $latestHtmlPath = Get-PayloadValue -Payload $commandPayload -Name "latest_html_path"
    $dashboardPath = $latestHtmlPath
    $overallStatus = Get-PayloadValue -Payload $commandPayload -Name "overall_status"
    $totalTopOpportunities = Get-PayloadValue -Payload $commandPayload -Name "total_top_opportunities"
    $topOpportunitiesRendered = Get-PayloadValue -Payload $commandPayload -Name "top_opportunities_rendered"
    $totalWatchlist = Get-PayloadValue -Payload $commandPayload -Name "total_watchlist"
    $watchlistRendered = Get-PayloadValue -Payload $commandPayload -Name "watchlist_rendered"
    $evaluation = Get-PayloadValue -Payload $commandPayload -Name "evaluation"

    if (-not (Test-Path -LiteralPath $latestHtmlPath)) {
        $warningReason = "El dashboard reporto exito, pero no genero latest HTML esperado: $latestHtmlPath"
    }
    else {
        $status = "ok"
        $partialErrorCount = 0
        $warningReason = $null
    }
}
elseif ($commandPayload) {
    $warningReason = Get-PayloadValue -Payload $commandPayload -Name "error"
    if ([string]::IsNullOrWhiteSpace($warningReason)) {
        $warningReason = $parseError
    }
}

$finishedAt = Get-Date
$durationSeconds = [math]::Round(($finishedAt - $startedAt).TotalSeconds, 3)

$summary = [ordered]@{
    status = $status
    started_at = $startedAt.ToString("o")
    finished_at = $finishedAt.ToString("o")
    duration_seconds = $durationSeconds
    repo_root = $repoRoot
    api_dir = $ApiDir
    python_path = $PythonPath
    log_dir = $LogDir
    top_limit = $TopLimit
    watchlist_limit = $WatchlistLimit
    partial_error_count = $partialErrorCount
    raw_output_path = $rawOutputPath
    parse_error = $parseError
    warning_reason = $warningReason
    generated_at = $generatedAt
    html_output_path = $htmlOutputPath
    latest_html_path = $latestHtmlPath
    dashboard_path = $dashboardPath
    html_size_bytes = Get-FileSizeBytes -Path $latestHtmlPath
    overall_status = $overallStatus
    total_top_opportunities = $totalTopOpportunities
    top_opportunities_rendered = $topOpportunitiesRendered
    total_watchlist = $totalWatchlist
    watchlist_rendered = $watchlistRendered
    evaluation = $evaluation
    command_payload = $commandPayload
}

$summaryJson = $summary | ConvertTo-Json -Depth 8
$summaryJson | Set-Content -Path $summaryPath -Encoding utf8
$summaryJson | Set-Content -Path $latestSummaryPath -Encoding utf8

$historyLine = "{0}`t{1}`ttop={2}`twatchlist={3}`tdashboard_path={4}`tpartial_errors={5}" -f `
    $startedAt.ToString("o"), `
    $status, `
    $(if ($null -ne $totalTopOpportunities) { $totalTopOpportunities } else { "" }), `
    $(if ($null -ne $totalWatchlist) { $totalWatchlist } else { "" }), `
    $(if ($null -ne $dashboardPath) { $dashboardPath } else { "" }), `
    $partialErrorCount
Add-Content -Path $historyPath -Value $historyLine -Encoding utf8

Write-Host "Dashboard run: $status"
Write-Host "Started at: $($startedAt.ToString("o"))"
Write-Host "Finished at: $($finishedAt.ToString("o"))"
Write-Host "Duration seconds: $durationSeconds"
Write-Host "Dashboard path: $dashboardPath"
Write-Host "Overall status: $overallStatus"
Write-Host "Top opportunities total / rendered: $totalTopOpportunities / $topOpportunitiesRendered"
Write-Host "Watchlist total / rendered: $totalWatchlist / $watchlistRendered"
Write-Host "Partial errors: $partialErrorCount"
Write-Host "Summary log: $summaryPath"
if (-not [string]::IsNullOrWhiteSpace($warningReason)) {
    Write-Host "Warning reason: $warningReason"
}

if ($status -eq "warning") {
    exit 0
}

exit 0
