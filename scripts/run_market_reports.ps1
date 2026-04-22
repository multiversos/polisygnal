[CmdletBinding()]
param(
    [string]$PresetsCsv = "top_opportunities,watchlist,evidence_backed,fallback_only",
    [string]$FormatsCsv = "json,csv",
    [int]$Limit = 50,
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

function Convert-CsvListToArray {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    return @(
        $Value.Split(",") |
            ForEach-Object { $_.Trim() } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
}

function Get-PresetFileLabel {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Preset
    )

    return $Preset.Replace("_", "-")
}

function Invoke-ReportExport {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Preset,
        [Parameter(Mandatory = $true)]
        [string]$Format,
        [Parameter(Mandatory = $true)]
        [string]$RunId,
        [Parameter(Mandatory = $true)]
        [string]$ApiDir,
        [Parameter(Mandatory = $true)]
        [string]$PythonPath,
        [Parameter(Mandatory = $true)]
        [string]$LogDir,
        [Parameter(Mandatory = $true)]
        [int]$Limit
    )

    $label = Get-PresetFileLabel -Preset $Preset
    $timestampedOutputPath = Join-Path $LogDir "$RunId.$label.$Format"
    $latestOutputPath = Join-Path $LogDir "latest-$label.$Format"
    $rawOutputPath = Join-Path $LogDir "$RunId.$label.$Format.command-output.txt"

    $commandArgs = @(
        "-m", "app.commands.export_market_overview",
        "--preset", $Preset,
        "--format", $Format,
        "--limit", $Limit.ToString(),
        "--output", $timestampedOutputPath
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
    if ($exitCode -eq 0 -and $commandPayload -and (Get-PayloadValue -Payload $commandPayload -Name "status") -eq "ok") {
        if (Test-Path -LiteralPath $timestampedOutputPath) {
            Copy-Item -LiteralPath $timestampedOutputPath -Destination $latestOutputPath -Force
            $status = "ok"
        }
        else {
            $parseError = "El export reporto exito, pero no genero el archivo esperado: $timestampedOutputPath"
        }
    }

    return [ordered]@{
        preset = $Preset
        format = $Format
        status = $status
        exit_code = $exitCode
        total_count = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "total_count" } else { $null })
        items_exported = $(if ($commandPayload) { Get-PayloadValue -Payload $commandPayload -Name "items_exported" } else { $null })
        output_path = $timestampedOutputPath
        latest_output_path = $(if ($status -eq "ok") { $latestOutputPath } else { $null })
        raw_output_path = $rawOutputPath
        parse_error = $parseError
        command_payload = $commandPayload
    }
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
if ([string]::IsNullOrWhiteSpace($ApiDir)) {
    $ApiDir = Join-Path $repoRoot "apps\api"
}
if ([string]::IsNullOrWhiteSpace($PythonPath)) {
    $PythonPath = Join-Path $ApiDir ".venv\Scripts\python.exe"
}
if ([string]::IsNullOrWhiteSpace($LogDir)) {
    $LogDir = Join-Path $repoRoot "logs\reports"
}

if (-not (Test-Path -LiteralPath $ApiDir)) {
    throw "No existe el directorio de la API: $ApiDir"
}
if (-not (Test-Path -LiteralPath $PythonPath)) {
    throw "No existe el ejecutable de Python esperado: $PythonPath"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$presets = Convert-CsvListToArray -Value $PresetsCsv
$formats = Convert-CsvListToArray -Value $FormatsCsv
if ($presets.Count -eq 0) {
    throw "Debe existir al menos un preset para generar reportes."
}
if ($formats.Count -eq 0) {
    throw "Debe existir al menos un formato para generar reportes."
}

$startedAt = Get-Date
$runId = $startedAt.ToString("yyyyMMdd_HHmmss")
$summaryPath = Join-Path $LogDir "$runId.summary.json"
$latestSummaryPath = Join-Path $LogDir "latest-summary.json"
$historyPath = Join-Path $LogDir "runs.log"

$exportResults = @()
foreach ($preset in $presets) {
    foreach ($format in $formats) {
        $exportResults += Invoke-ReportExport `
            -Preset $preset `
            -Format $format `
            -RunId $runId `
            -ApiDir $ApiDir `
            -PythonPath $PythonPath `
            -LogDir $LogDir `
            -Limit $Limit
    }
}

$finishedAt = Get-Date
$durationSeconds = [math]::Round(($finishedAt - $startedAt).TotalSeconds, 3)

$successfulExports = @($exportResults | Where-Object { $_.status -eq "ok" })
$failedExports = @($exportResults | Where-Object { $_.status -ne "ok" })
$partialErrorCount = $failedExports.Count

$status = "ok"
if ($successfulExports.Count -eq 0) {
    $status = "error"
}
elseif ($failedExports.Count -gt 0) {
    $status = "warning"
}

$presetSummaries = @()
foreach ($preset in $presets) {
    $presetResults = @($exportResults | Where-Object { $_.preset -eq $preset })
    $jsonResult = $presetResults | Where-Object { $_.format -eq "json" } | Select-Object -First 1
    $csvResult = $presetResults | Where-Object { $_.format -eq "csv" } | Select-Object -First 1
    $presetStatus = $(if (@($presetResults | Where-Object { $_.status -eq "error" }).Count -gt 0) { "error" } else { "ok" })
    $itemCount = $null
    if ($jsonResult -and $null -ne $jsonResult.total_count) {
        $itemCount = [int]$jsonResult.total_count
    }
    elseif ($csvResult -and $null -ne $csvResult.total_count) {
        $itemCount = [int]$csvResult.total_count
    }

    $presetSummaries += [ordered]@{
        preset = $preset
        status = $presetStatus
        item_count = $itemCount
        items_exported = $(if ($jsonResult -and $null -ne $jsonResult.items_exported) { [int]$jsonResult.items_exported } elseif ($csvResult -and $null -ne $csvResult.items_exported) { [int]$csvResult.items_exported } else { $null })
        json_output_path = $(if ($jsonResult -and $jsonResult.status -eq "ok") { $jsonResult.output_path } else { $null })
        latest_json_path = $(if ($jsonResult -and $jsonResult.status -eq "ok") { $jsonResult.latest_output_path } else { $null })
        csv_output_path = $(if ($csvResult -and $csvResult.status -eq "ok") { $csvResult.output_path } else { $null })
        latest_csv_path = $(if ($csvResult -and $csvResult.status -eq "ok") { $csvResult.latest_output_path } else { $null })
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
    presets = $presets
    formats = $formats
    limit = $Limit
    frequency_recommendation_minutes = 120
    partial_error_count = $partialErrorCount
    generated_presets = $presetSummaries
    export_results = $exportResults
}

$summaryJson = $summary | ConvertTo-Json -Depth 10
$summaryJson | Set-Content -Path $summaryPath -Encoding utf8
$summaryJson | Set-Content -Path $latestSummaryPath -Encoding utf8

$historyParts = @()
foreach ($presetSummary in $presetSummaries) {
    $historyParts += "{0}={1}" -f $presetSummary.preset, $(if ($null -ne $presetSummary.item_count) { $presetSummary.item_count } else { "" })
}
$historyLine = "{0}`t{1}`tpresets={2}`tpartial_errors={3}" -f `
    $startedAt.ToString("o"), `
    $status, `
    ($historyParts -join ","), `
    $partialErrorCount
Add-Content -Path $historyPath -Value $historyLine -Encoding utf8

Write-Host "Reports run: $status"
Write-Host "Started at: $($startedAt.ToString("o"))"
Write-Host "Finished at: $($finishedAt.ToString("o"))"
Write-Host "Duration seconds: $durationSeconds"
Write-Host "Presets: $($presets -join ', ')"
Write-Host "Formats: $($formats -join ', ')"
foreach ($presetSummary in $presetSummaries) {
    Write-Host "Preset $($presetSummary.preset): items=$($presetSummary.item_count) latest_json=$($presetSummary.latest_json_path) latest_csv=$($presetSummary.latest_csv_path)"
}
Write-Host "Partial errors: $partialErrorCount"
Write-Host "Summary log: $summaryPath"

if ($status -eq "error") {
    exit 1
}

exit 0
