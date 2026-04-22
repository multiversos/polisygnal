[CmdletBinding()]
param(
    [int]$Limit = 0,
    [string]$DiscoveryScope = "",
    [string]$MarketType = "",
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
    $LogDir = Join-Path $repoRoot "logs\market_snapshots"
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

$commandArgs = @("-m", "app.commands.capture_market_snapshots")
if ($Limit -gt 0) {
    $commandArgs += "--limit"
    $commandArgs += $Limit.ToString()
}
if (-not [string]::IsNullOrWhiteSpace($DiscoveryScope)) {
    $commandArgs += "--discovery-scope"
    $commandArgs += $DiscoveryScope
}
if (-not [string]::IsNullOrWhiteSpace($MarketType)) {
    $commandArgs += "--market-type"
    $commandArgs += $MarketType
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
    discovery_scope = $(if (-not [string]::IsNullOrWhiteSpace($DiscoveryScope)) { $DiscoveryScope } else { $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "discovery_scope" } else { $null }) })
    market_type = $(if (-not [string]::IsNullOrWhiteSpace($MarketType)) { $MarketType } else { $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "market_type" } else { $null }) })
    exit_code = $exitCode
    raw_output_path = $rawOutputPath
    partial_error_count = $partialErrorCount
    parse_error = $parseError
    command_payload = $commandPayload
}

$summaryJson = $summary | ConvertTo-Json -Depth 10
$summaryJson | Set-Content -Path $summaryPath -Encoding utf8
$summaryJson | Set-Content -Path $latestSummaryPath -Encoding utf8

$historyLine = "{0}`t{1}`tconsidered={2}`tcreated={3}`tskipped={4}`tpartial_errors={5}`texit={6}" -f `
    $startedAt.ToString("o"), `
    $status, `
    $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "markets_considered" } else { "" }), `
    $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "snapshots_created" } else { "" }), `
    $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "snapshots_skipped" } else { "" }), `
    $(if ($null -ne $partialErrorCount) { $partialErrorCount } else { "" }), `
    $exitCode
Add-Content -Path $historyPath -Value $historyLine -Encoding utf8

Write-Host "Snapshot run: $status"
Write-Host "Started at: $($startedAt.ToString("o"))"
Write-Host "Finished at: $($finishedAt.ToString("o"))"
Write-Host "Duration seconds: $durationSeconds"
if (-not [string]::IsNullOrWhiteSpace($DiscoveryScope)) {
    Write-Host "Discovery scope: $DiscoveryScope"
}
if (-not [string]::IsNullOrWhiteSpace($MarketType)) {
    Write-Host "Market type: $MarketType"
}
if ($commandPayload) {
    Write-Host "Markets considered: $(Get-PayloadValue -Payload $commandPayload -Name "markets_considered")"
    Write-Host "Snapshots created: $(Get-PayloadValue -Payload $commandPayload -Name "snapshots_created")"
    Write-Host "Snapshots skipped: $(Get-PayloadValue -Payload $commandPayload -Name "snapshots_skipped")"
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
