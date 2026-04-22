[CmdletBinding()]
param(
    [string]$PythonPath = "",
    [string]$ApiDir = "",
    [string]$LogDir = "",
    [string]$Format = "both",
    [int]$TopLimit = 5,
    [int]$WatchlistLimit = 5,
    [int]$ReviewLimit = 5
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
    $LogDir = Join-Path $repoRoot "logs\briefings"
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
    "-m", "app.commands.generate_briefing",
    "--format", $Format,
    "--output-dir", $LogDir,
    "--top-limit", $TopLimit.ToString(),
    "--watchlist-limit", $WatchlistLimit.ToString(),
    "--review-limit", $ReviewLimit.ToString()
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

$status = "error"
$partialErrorCount = 1
$jsonPath = $null
$latestJsonPath = $null
$textPath = $null
$latestTextPath = $null
$generatedAt = $null
$summaryText = $null
$topOpportunitiesCount = $null
$watchlistCount = $null
$reviewFlagsCount = $null
$totalMarkets = $null

if ($exitCode -eq 0 -and $commandPayload -and (Get-PayloadValue -Payload $commandPayload -Name "status") -eq "ok") {
    $jsonPath = Get-PayloadValue -Payload $commandPayload -Name "json_output_path"
    $latestJsonPath = Get-PayloadValue -Payload $commandPayload -Name "latest_json_path"
    $textPath = Get-PayloadValue -Payload $commandPayload -Name "text_output_path"
    $latestTextPath = Get-PayloadValue -Payload $commandPayload -Name "latest_text_path"
    $generatedAt = Get-PayloadValue -Payload $commandPayload -Name "generated_at"
    $summaryText = Get-PayloadValue -Payload $commandPayload -Name "summary"
    $topOpportunitiesCount = Get-PayloadValue -Payload $commandPayload -Name "top_opportunities_count"
    $watchlistCount = Get-PayloadValue -Payload $commandPayload -Name "watchlist_count"
    $reviewFlagsCount = Get-PayloadValue -Payload $commandPayload -Name "review_flags_count"
    $totalMarkets = Get-PayloadValue -Payload $commandPayload -Name "total_markets"

    if ($Format -in @("json", "both") -and -not (Test-Path -LiteralPath $latestJsonPath)) {
        $parseError = "El briefing reporto exito, pero no genero latest JSON esperado: $latestJsonPath"
    }
    elseif ($Format -in @("txt", "both") -and -not (Test-Path -LiteralPath $latestTextPath)) {
        $parseError = "El briefing reporto exito, pero no genero latest TXT esperado: $latestTextPath"
    }
    else {
        $status = "ok"
        $partialErrorCount = 0
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
    format = $Format
    top_limit = $TopLimit
    watchlist_limit = $WatchlistLimit
    review_limit = $ReviewLimit
    partial_error_count = $partialErrorCount
    raw_output_path = $rawOutputPath
    parse_error = $parseError
    generated_at = $generatedAt
    summary_text = $summaryText
    json_output_path = $jsonPath
    latest_json_path = $latestJsonPath
    json_size_bytes = Get-FileSizeBytes -Path $latestJsonPath
    text_output_path = $textPath
    latest_text_path = $latestTextPath
    text_size_bytes = Get-FileSizeBytes -Path $latestTextPath
    top_opportunities_count = $topOpportunitiesCount
    watchlist_count = $watchlistCount
    review_flags_count = $reviewFlagsCount
    total_markets = $totalMarkets
    command_payload = $commandPayload
}

$summaryJson = $summary | ConvertTo-Json -Depth 8
$summaryJson | Set-Content -Path $summaryPath -Encoding utf8
$summaryJson | Set-Content -Path $latestSummaryPath -Encoding utf8

$historyLine = "{0}`t{1}`ttop={2}`twatchlist={3}`treview={4}`tpartial_errors={5}" -f `
    $startedAt.ToString("o"), `
    $status, `
    $(if ($null -ne $topOpportunitiesCount) { $topOpportunitiesCount } else { "" }), `
    $(if ($null -ne $watchlistCount) { $watchlistCount } else { "" }), `
    $(if ($null -ne $reviewFlagsCount) { $reviewFlagsCount } else { "" }), `
    $partialErrorCount
Add-Content -Path $historyPath -Value $historyLine -Encoding utf8

Write-Host "Briefing run: $status"
Write-Host "Started at: $($startedAt.ToString("o"))"
Write-Host "Finished at: $($finishedAt.ToString("o"))"
Write-Host "Duration seconds: $durationSeconds"
Write-Host "Format: $Format"
Write-Host "Latest JSON: $latestJsonPath"
Write-Host "Latest TXT: $latestTextPath"
Write-Host "Top opportunities: $topOpportunitiesCount"
Write-Host "Watchlist: $watchlistCount"
Write-Host "Review flags: $reviewFlagsCount"
Write-Host "Partial errors: $partialErrorCount"
Write-Host "Summary log: $summaryPath"

if ($status -eq "error") {
    exit 1
}

exit 0
