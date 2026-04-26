[CmdletBinding()]
param(
    [int]$MarketId = 0,
    [int]$Limit = 5,
    [ValidateSet("local_only", "cheap_research")]
    [string]$ResearchMode = "local_only",
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
    $LogDir = Join-Path $repoRoot "logs\research"
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

$commandArgs = @("-m", "app.commands.run_market_research", "--research-mode", $ResearchMode)
if ($MarketId -gt 0) {
    $commandArgs += "--market-id"
    $commandArgs += $MarketId.ToString()
}
else {
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

$status = "error"
if ($exitCode -eq 0 -and $commandPayload) {
    $partialErrors = Get-PayloadValue -Payload $commandPayload -Name "partial_errors"
    if ($partialErrors -and @($partialErrors).Count -gt 0) {
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
    market_id = $(if ($MarketId -gt 0) { $MarketId } else { $null })
    limit = $(if ($MarketId -gt 0) { $null } else { $Limit })
    research_mode = $ResearchMode
    exit_code = $exitCode
    raw_output_path = $rawOutputPath
    parse_error = $parseError
    command_payload = $commandPayload
}

$summaryJson = $summary | ConvertTo-Json -Depth 10
$summaryJson | Set-Content -Path $summaryPath -Encoding utf8
$summaryJson | Set-Content -Path $latestSummaryPath -Encoding utf8

$historyLine = "{0}`t{1}`tmarket_id={2}`tlimit={3}`tmode={4}`texit={5}" -f `
    $startedAt.ToString("o"), `
    $status, `
    $(if ($MarketId -gt 0) { $MarketId } else { "" }), `
    $(if ($MarketId -gt 0) { "" } else { $Limit }), `
    $ResearchMode, `
    $exitCode
Add-Content -Path $historyPath -Value $historyLine -Encoding utf8

Write-Host "Research run: $status"
Write-Host "Started at: $($startedAt.ToString("o"))"
Write-Host "Finished at: $($finishedAt.ToString("o"))"
Write-Host "Duration seconds: $durationSeconds"
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
