[CmdletBinding()]
param(
    [string]$PythonPath = "",
    [string]$ApiDir = "",
    [string]$LogDir = "",
    [string]$Format = "both",
    [decimal]$YesProbabilityThreshold = 0.05,
    [decimal]$ConfidenceThreshold = 0.10,
    [decimal]$EdgeThreshold = 0.05,
    [string]$RunId = "",
    [string]$PipelineSummaryPath = ""
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
    $LogDir = Join-Path $repoRoot "logs\diffs"
}

if (-not (Test-Path -LiteralPath $ApiDir)) {
    throw "No existe el directorio de la API: $ApiDir"
}
if (-not (Test-Path -LiteralPath $PythonPath)) {
    throw "No existe el ejecutable de Python esperado: $PythonPath"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startedAt = Get-Date
$runTimestamp = $startedAt.ToString("yyyyMMdd_HHmmss")
$summaryPath = Join-Path $LogDir "$runTimestamp.summary.json"
$latestSummaryPath = Join-Path $LogDir "latest-summary.json"
$historyPath = Join-Path $LogDir "runs.log"
$rawOutputPath = Join-Path $LogDir "$runTimestamp.command-output.txt"

$commandArgs = @(
    "-m", "app.commands.generate_market_diff",
    "--format", $Format,
    "--output-dir", $LogDir,
    "--yes-probability-threshold", $YesProbabilityThreshold.ToString(),
    "--confidence-threshold", $ConfidenceThreshold.ToString(),
    "--edge-threshold", $EdgeThreshold.ToString()
)
if (-not [string]::IsNullOrWhiteSpace($RunId)) {
    $commandArgs += "--run-id"
    $commandArgs += $RunId
}
if (-not [string]::IsNullOrWhiteSpace($PipelineSummaryPath)) {
    $commandArgs += "--pipeline-summary-path"
    $commandArgs += $PipelineSummaryPath
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
$currentSnapshotPath = $null
$latestSnapshotPath = $null
$previousSnapshotPath = $null
$jsonPath = $null
$latestJsonPath = $null
$textPath = $null
$latestTextPath = $null
$generatedAt = $null
$comparisonReady = $null
$summaryText = $null
$enteredCount = $null
$exitedCount = $null
$bucketChangesCount = $null
$materialChangesCount = $null
$thresholds = $null

if ($exitCode -eq 0 -and $commandPayload -and (Get-PayloadValue -Payload $commandPayload -Name "status") -eq "ok") {
    $currentSnapshotPath = Get-PayloadValue -Payload $commandPayload -Name "current_snapshot_path"
    $latestSnapshotPath = Get-PayloadValue -Payload $commandPayload -Name "latest_snapshot_path"
    $previousSnapshotPath = Get-PayloadValue -Payload $commandPayload -Name "previous_snapshot_path"
    $jsonPath = Get-PayloadValue -Payload $commandPayload -Name "json_output_path"
    $latestJsonPath = Get-PayloadValue -Payload $commandPayload -Name "latest_json_path"
    $textPath = Get-PayloadValue -Payload $commandPayload -Name "text_output_path"
    $latestTextPath = Get-PayloadValue -Payload $commandPayload -Name "latest_text_path"
    $generatedAt = Get-PayloadValue -Payload $commandPayload -Name "generated_at"
    $comparisonReady = Get-PayloadValue -Payload $commandPayload -Name "comparison_ready"
    $summaryText = Get-PayloadValue -Payload $commandPayload -Name "summary_text"
    $enteredCount = Get-PayloadValue -Payload $commandPayload -Name "top_opportunities_entered_count"
    $exitedCount = Get-PayloadValue -Payload $commandPayload -Name "top_opportunities_exited_count"
    $bucketChangesCount = Get-PayloadValue -Payload $commandPayload -Name "bucket_changes_count"
    $materialChangesCount = Get-PayloadValue -Payload $commandPayload -Name "material_score_changes_count"
    $thresholds = Get-PayloadValue -Payload $commandPayload -Name "thresholds"

    if ($Format -in @("json", "both") -and -not (Test-Path -LiteralPath $latestJsonPath)) {
        $parseError = "El diff reporto exito, pero no genero latest JSON esperado: $latestJsonPath"
    }
    elseif ($Format -in @("txt", "both") -and -not (Test-Path -LiteralPath $latestTextPath)) {
        $parseError = "El diff reporto exito, pero no genero latest TXT esperado: $latestTextPath"
    }
    elseif (-not (Test-Path -LiteralPath $latestSnapshotPath)) {
        $parseError = "El diff reporto exito, pero no genero latest snapshot esperado: $latestSnapshotPath"
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
    partial_error_count = $partialErrorCount
    raw_output_path = $rawOutputPath
    parse_error = $parseError
    generated_at = $generatedAt
    comparison_ready = $comparisonReady
    summary_text = $summaryText
    current_snapshot_path = $currentSnapshotPath
    latest_snapshot_path = $latestSnapshotPath
    previous_snapshot_path = $previousSnapshotPath
    snapshot_size_bytes = Get-FileSizeBytes -Path $latestSnapshotPath
    json_output_path = $jsonPath
    latest_json_path = $latestJsonPath
    json_size_bytes = Get-FileSizeBytes -Path $latestJsonPath
    text_output_path = $textPath
    latest_text_path = $latestTextPath
    text_size_bytes = Get-FileSizeBytes -Path $latestTextPath
    top_opportunities_entered_count = $enteredCount
    top_opportunities_exited_count = $exitedCount
    bucket_changes_count = $bucketChangesCount
    material_score_changes_count = $materialChangesCount
    thresholds = $thresholds
    command_payload = $commandPayload
}

$summaryJson = $summary | ConvertTo-Json -Depth 8
$summaryJson | Set-Content -Path $summaryPath -Encoding utf8
$summaryJson | Set-Content -Path $latestSummaryPath -Encoding utf8

$historyLine = "{0}`t{1}`tcomparison_ready={2}`tentered={3}`texited={4}`tbucket_changes={5}`tmaterial_changes={6}`tpartial_errors={7}" -f `
    $startedAt.ToString("o"), `
    $status, `
    $(if ($null -ne $comparisonReady) { $comparisonReady } else { "" }), `
    $(if ($null -ne $enteredCount) { $enteredCount } else { "" }), `
    $(if ($null -ne $exitedCount) { $exitedCount } else { "" }), `
    $(if ($null -ne $bucketChangesCount) { $bucketChangesCount } else { "" }), `
    $(if ($null -ne $materialChangesCount) { $materialChangesCount } else { "" }), `
    $partialErrorCount
Add-Content -Path $historyPath -Value $historyLine -Encoding utf8

Write-Host "Diff run: $status"
Write-Host "Started at: $($startedAt.ToString("o"))"
Write-Host "Finished at: $($finishedAt.ToString("o"))"
Write-Host "Duration seconds: $durationSeconds"
Write-Host "Comparison ready: $comparisonReady"
Write-Host "Latest snapshot: $latestSnapshotPath"
Write-Host "Latest JSON: $latestJsonPath"
Write-Host "Latest TXT: $latestTextPath"
Write-Host "Top opportunities entered / exited: $enteredCount / $exitedCount"
Write-Host "Bucket changes: $bucketChangesCount"
Write-Host "Material score changes: $materialChangesCount"
Write-Host "Partial errors: $partialErrorCount"
Write-Host "Summary log: $summaryPath"

if ($status -eq "error") {
    exit 1
}

exit 0
