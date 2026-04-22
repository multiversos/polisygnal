[CmdletBinding()]
param(
    [int]$Limit = 0,
    [string]$LogDir = "",
    [string]$PythonPath = "",
    [string]$ApiDir = "",
    [switch]$SkipReports,
    [string]$ReportsPresetsCsv = "top_opportunities,watchlist,evidence_backed,fallback_only",
    [string]$ReportsFormatsCsv = "json,csv",
    [int]$ReportsLimit = 50,
    [string]$ReportsLogDir = "",
    [string]$BriefingLogDir = "",
    [string]$DiffLogDir = "",
    [string]$DashboardLogDir = ""
)

$ErrorActionPreference = "Stop"

function Get-JsonFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    try {
        return (Get-Content -Path $Path -Raw | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Get-ObjectValue {
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

function Invoke-PipelineStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StepName,
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath,
        [Parameter(Mandatory = $true)]
        [string]$StepLogDir,
        [Parameter(Mandatory = $true)]
        [string]$StepOutputPath,
        [int]$Limit = 0,
        [string[]]$ExtraArgs = @()
    )

    $stepStartedAt = Get-Date

    if (-not (Test-Path -LiteralPath $ScriptPath)) {
        return [ordered]@{
            name = $StepName
            status = "error"
            started_at = $stepStartedAt.ToString("o")
            finished_at = (Get-Date).ToString("o")
            duration_seconds = 0
            exit_code = 1
            summary_path = $null
            wrapper_output_path = $StepOutputPath
            partial_error_count = 1
            error = "No existe el script requerido: $ScriptPath"
            summary = $null
        }
    }

    New-Item -ItemType Directory -Force -Path $StepLogDir | Out-Null
    $powerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $commandArgs = @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $ScriptPath,
        "-LogDir",
        $StepLogDir
    )
    if ($Limit -gt 0) {
        $commandArgs += "-Limit"
        $commandArgs += $Limit.ToString()
    }
    if ($ExtraArgs.Count -gt 0) {
        $commandArgs += $ExtraArgs
    }

    $commandOutput = & $powerShellExe @commandArgs 2>&1
    $exitCode = $LASTEXITCODE
    $stepFinishedAt = Get-Date
    $durationSeconds = [math]::Round(($stepFinishedAt - $stepStartedAt).TotalSeconds, 3)
    $outputText = ($commandOutput | Out-String).Trim()
    $outputText | Set-Content -Path $StepOutputPath -Encoding utf8

    $summaryPath = Join-Path $StepLogDir "latest-summary.json"
    $summary = Get-JsonFile -Path $summaryPath
    $status = $(if ($summary) { Get-ObjectValue -Payload $summary -Name "status" } else { $null })
    if ([string]::IsNullOrWhiteSpace($status)) {
        $status = $(if ($exitCode -eq 0) { "ok" } else { "error" })
    }

    $partialErrorCount = $null
    if ($summary) {
        $partialErrorCount = Get-ObjectValue -Payload $summary -Name "partial_error_count"
        if ($null -eq $partialErrorCount) {
            $payload = Get-ObjectValue -Payload $summary -Name "command_payload"
            if ($null -ne $payload) {
                $partialErrorCount = Get-ObjectValue -Payload $payload -Name "partial_error_count"
                if ($null -eq $partialErrorCount) {
                    $partialErrors = Get-ObjectValue -Payload $payload -Name "partial_errors"
                    if ($null -ne $partialErrors) {
                        $partialErrorCount = @($partialErrors).Count
                    }
                }
            }
        }
    }
    if ($status -eq "error" -and $null -eq $partialErrorCount) {
        $partialErrorCount = 1
    }

    return [ordered]@{
        name = $StepName
        status = $status
        started_at = $stepStartedAt.ToString("o")
        finished_at = $stepFinishedAt.ToString("o")
        duration_seconds = $durationSeconds
        exit_code = $exitCode
        summary_path = $summaryPath
        wrapper_output_path = $StepOutputPath
        partial_error_count = $partialErrorCount
        summary = $summary
    }
}

function Get-CombinedStatus {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$StepCollection
    )

    $statuses = @($StepCollection | ForEach-Object { $_.status })
    if ($statuses -contains "error") {
        return "error"
    }
    if ($statuses -contains "warning") {
        return "warning"
    }
    return "ok"
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
if ([string]::IsNullOrWhiteSpace($LogDir)) {
    $LogDir = Join-Path $repoRoot "logs\market_pipeline"
}
if ([string]::IsNullOrWhiteSpace($ApiDir)) {
    $ApiDir = Join-Path $repoRoot "apps\api"
}
if ([string]::IsNullOrWhiteSpace($PythonPath)) {
    $PythonPath = Join-Path $ApiDir ".venv\Scripts\python.exe"
}
if ([string]::IsNullOrWhiteSpace($ReportsLogDir)) {
    $ReportsLogDir = Join-Path $repoRoot "logs\reports"
}
if ([string]::IsNullOrWhiteSpace($BriefingLogDir)) {
    $BriefingLogDir = Join-Path $repoRoot "logs\briefings"
}
if ([string]::IsNullOrWhiteSpace($DiffLogDir)) {
    $DiffLogDir = Join-Path $repoRoot "logs\diffs"
}
if ([string]::IsNullOrWhiteSpace($DashboardLogDir)) {
    $DashboardLogDir = Join-Path $repoRoot "logs\dashboard"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$startedAt = Get-Date
$runId = $startedAt.ToString("yyyyMMdd_HHmmss")
$summaryPath = Join-Path $LogDir "$runId.summary.json"
$latestSummaryPath = Join-Path $LogDir "latest-summary.json"
$historyPath = Join-Path $LogDir "runs.log"

$snapshotScript = Join-Path $repoRoot "scripts\run_market_snapshots.ps1"
$evidenceScript = Join-Path $repoRoot "scripts\run_market_evidence.ps1"
$scoringScript = Join-Path $repoRoot "scripts\run_market_scoring.ps1"
$reportsScript = Join-Path $repoRoot "scripts\run_market_reports.ps1"
$briefingScript = Join-Path $repoRoot "scripts\run_market_briefing.ps1"
$diffScript = Join-Path $repoRoot "scripts\run_market_diff.ps1"
$dashboardScript = Join-Path $repoRoot "scripts\run_market_dashboard.ps1"

$steps = [ordered]@{}
$steps.snapshots = Invoke-PipelineStep `
    -StepName "snapshots" `
    -ScriptPath $snapshotScript `
    -StepLogDir (Join-Path $LogDir "snapshots") `
    -StepOutputPath (Join-Path $LogDir "$runId.snapshots.wrapper-output.txt") `
    -Limit $Limit `
    -ExtraArgs @("-ApiDir", $ApiDir, "-PythonPath", $PythonPath, "-DiscoveryScope", "nba", "-MarketType", "winner")

$steps.evidence = Invoke-PipelineStep `
    -StepName "evidence" `
    -ScriptPath $evidenceScript `
    -StepLogDir (Join-Path $LogDir "evidence") `
    -StepOutputPath (Join-Path $LogDir "$runId.evidence.wrapper-output.txt") `
    -Limit $Limit `
    -ExtraArgs @("-ApiDir", $ApiDir, "-PythonPath", $PythonPath)

$steps.scoring = Invoke-PipelineStep `
    -StepName "scoring" `
    -ScriptPath $scoringScript `
    -StepLogDir (Join-Path $LogDir "scoring") `
    -StepOutputPath (Join-Path $LogDir "$runId.scoring.wrapper-output.txt") `
    -Limit $Limit `
    -ExtraArgs @("-ApiDir", $ApiDir, "-PythonPath", $PythonPath)

$pipelineStatus = Get-CombinedStatus -StepCollection @($steps.snapshots, $steps.evidence, $steps.scoring)

$reportsStep = $null
if ($SkipReports) {
    $reportsStep = [ordered]@{
        name = "reports"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = "skip_reports_flag"
        summary = $null
    }
}
elseif ($pipelineStatus -eq "error") {
    $reportsStep = [ordered]@{
        name = "reports"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = "pipeline_error"
        summary = $null
    }
}
else {
    $reportsStep = Invoke-PipelineStep `
        -StepName "reports" `
        -ScriptPath $reportsScript `
        -StepLogDir $ReportsLogDir `
        -StepOutputPath (Join-Path $LogDir "$runId.reports.wrapper-output.txt") `
        -Limit $ReportsLimit `
        -ExtraArgs @("-ApiDir", $ApiDir, "-PythonPath", $PythonPath, "-PresetsCsv", $ReportsPresetsCsv, "-FormatsCsv", $ReportsFormatsCsv)
}

$briefingStep = $null
if ($pipelineStatus -eq "error") {
    $briefingStep = [ordered]@{
        name = "briefing"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = "pipeline_error"
        summary = $null
    }
}
elseif ($reportsStep.status -eq "skipped") {
    $briefingStep = [ordered]@{
        name = "briefing"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = $(if ($reportsStep.skip_reason) { "reports_$($reportsStep.skip_reason)" } else { "reports_skipped" })
        summary = $null
    }
}
elseif ($reportsStep.status -ne "ok") {
    $briefingStep = [ordered]@{
        name = "briefing"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = "reports_not_ok"
        summary = $null
    }
}
else {
    $briefingStep = Invoke-PipelineStep `
        -StepName "briefing" `
        -ScriptPath $briefingScript `
        -StepLogDir $BriefingLogDir `
        -StepOutputPath (Join-Path $LogDir "$runId.briefing.wrapper-output.txt") `
        -ExtraArgs @("-ApiDir", $ApiDir, "-PythonPath", $PythonPath)
}

$diffStep = $null
if ($pipelineStatus -eq "error") {
    $diffStep = [ordered]@{
        name = "diff"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = "pipeline_error"
        summary = $null
    }
}
elseif ($briefingStep.status -eq "skipped") {
    $diffStep = [ordered]@{
        name = "diff"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = $(if ($briefingStep.skip_reason) { "briefing_$($briefingStep.skip_reason)" } else { "briefing_skipped" })
        summary = $null
    }
}
elseif ($briefingStep.status -ne "ok") {
    $diffStep = [ordered]@{
        name = "diff"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = "briefing_not_ok"
        summary = $null
    }
}
else {
    $diffStep = Invoke-PipelineStep `
        -StepName "diff" `
        -ScriptPath $diffScript `
        -StepLogDir $DiffLogDir `
        -StepOutputPath (Join-Path $LogDir "$runId.diff.wrapper-output.txt") `
        -ExtraArgs @("-ApiDir", $ApiDir, "-PythonPath", $PythonPath, "-RunId", $runId, "-PipelineSummaryPath", $summaryPath)
}

$dashboardStep = $null
if ($pipelineStatus -eq "error") {
    $dashboardStep = [ordered]@{
        name = "dashboard"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = "pipeline_error"
        summary = $null
    }
}
elseif ($reportsStep.status -eq "skipped") {
    $dashboardStep = [ordered]@{
        name = "dashboard"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = $(if ($reportsStep.skip_reason) { "reports_$($reportsStep.skip_reason)" } else { "reports_skipped" })
        summary = $null
    }
}
elseif ($reportsStep.status -ne "ok") {
    $dashboardStep = [ordered]@{
        name = "dashboard"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = "reports_not_ok"
        summary = $null
    }
}
elseif ($briefingStep.status -eq "skipped") {
    $dashboardStep = [ordered]@{
        name = "dashboard"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = $(if ($briefingStep.skip_reason) { "briefing_$($briefingStep.skip_reason)" } else { "briefing_skipped" })
        summary = $null
    }
}
elseif ($briefingStep.status -ne "ok") {
    $dashboardStep = [ordered]@{
        name = "dashboard"
        status = "skipped"
        started_at = $null
        finished_at = $null
        duration_seconds = 0
        exit_code = 0
        summary_path = $null
        wrapper_output_path = $null
        partial_error_count = 0
        skip_reason = "briefing_not_ok"
        summary = $null
    }
}
else {
    $dashboardStep = Invoke-PipelineStep `
        -StepName "dashboard" `
        -ScriptPath $dashboardScript `
        -StepLogDir $DashboardLogDir `
        -StepOutputPath (Join-Path $LogDir "$runId.dashboard.wrapper-output.txt") `
        -ExtraArgs @("-ApiDir", $ApiDir, "-PythonPath", $PythonPath)
}

$finishedAt = Get-Date
$durationSeconds = [math]::Round(($finishedAt - $startedAt).TotalSeconds, 3)

$overallStatus = $pipelineStatus
if ($pipelineStatus -ne "error") {
    if ($reportsStep.status -eq "error" -or $briefingStep.status -eq "error" -or $diffStep.status -eq "error" -or $dashboardStep.status -eq "error") {
        $overallStatus = "warning"
    }
    elseif ($pipelineStatus -eq "warning" -or $reportsStep.status -eq "warning" -or $briefingStep.status -eq "warning" -or $diffStep.status -eq "warning" -or $dashboardStep.status -eq "warning") {
        $overallStatus = "warning"
    }
}

$partialErrorCount = 0
foreach ($step in $steps.Values) {
    if ($null -ne $step.partial_error_count) {
        $partialErrorCount += [int]$step.partial_error_count
    }
}
if ($null -ne $reportsStep.partial_error_count) {
    $partialErrorCount += [int]$reportsStep.partial_error_count
}
if ($null -ne $briefingStep.partial_error_count) {
    $partialErrorCount += [int]$briefingStep.partial_error_count
}
if ($null -ne $diffStep.partial_error_count) {
    $partialErrorCount += [int]$diffStep.partial_error_count
}
if ($null -ne $dashboardStep.partial_error_count) {
    $partialErrorCount += [int]$dashboardStep.partial_error_count
}

$evidenceSummary = $steps.evidence.summary
$scoringSummary = $steps.scoring.summary
$reportsSummary = $reportsStep.summary
$briefingSummary = $briefingStep.summary
$diffSummary = $diffStep.summary
$dashboardSummary = $dashboardStep.summary
$operationalSummary = [ordered]@{
    evidence = [ordered]@{
        markets_considered = $(if ($evidenceSummary) { Get-ObjectValue -Payload $evidenceSummary -Name "markets_considered" } else { $null })
        markets_eligible_for_evidence = $(if ($evidenceSummary) { Get-ObjectValue -Payload $evidenceSummary -Name "markets_eligible_for_evidence" } else { $null })
        markets_processed = $(if ($evidenceSummary) { Get-ObjectValue -Payload $evidenceSummary -Name "markets_processed" } else { $null })
        markets_skipped_non_matchable = $(if ($evidenceSummary) { Get-ObjectValue -Payload $evidenceSummary -Name "markets_skipped_non_matchable" } else { $null })
        markets_skipped_unsupported_shape = $(if ($evidenceSummary) { Get-ObjectValue -Payload $evidenceSummary -Name "markets_skipped_unsupported_shape" } else { $null })
        markets_with_odds_match = $(if ($evidenceSummary) { Get-ObjectValue -Payload $evidenceSummary -Name "markets_with_odds_match" } else { $null })
        markets_with_news_match = $(if ($evidenceSummary) { Get-ObjectValue -Payload $evidenceSummary -Name "markets_with_news_match" } else { $null })
        evidence_created = $(if ($evidenceSummary) { Get-ObjectValue -Payload $evidenceSummary -Name "evidence_created" } else { $null })
        evidence_updated = $(if ($evidenceSummary) { Get-ObjectValue -Payload $evidenceSummary -Name "evidence_updated" } else { $null })
    }
    scoring = [ordered]@{
        markets_considered = $(if ($scoringSummary) { Get-ObjectValue -Payload $scoringSummary -Name "markets_considered" } else { $null })
        markets_scored = $(if ($scoringSummary) { Get-ObjectValue -Payload $scoringSummary -Name "markets_scored" } else { $null })
        markets_scored_with_any_evidence = $(if ($scoringSummary) { Get-ObjectValue -Payload $scoringSummary -Name "markets_scored_with_any_evidence" } else { $null })
        markets_scored_with_snapshot_fallback = $(if ($scoringSummary) { Get-ObjectValue -Payload $scoringSummary -Name "markets_scored_with_snapshot_fallback" } else { $null })
        markets_scored_with_odds_evidence = $(if ($scoringSummary) { Get-ObjectValue -Payload $scoringSummary -Name "markets_scored_with_odds_evidence" } else { $null })
        markets_scored_with_news_evidence = $(if ($scoringSummary) { Get-ObjectValue -Payload $scoringSummary -Name "markets_scored_with_news_evidence" } else { $null })
        used_odds_count = $(if ($scoringSummary) { Get-ObjectValue -Payload $scoringSummary -Name "used_odds_count" } else { $null })
        used_news_count = $(if ($scoringSummary) { Get-ObjectValue -Payload $scoringSummary -Name "used_news_count" } else { $null })
    }
}

$pipelineBlock = [ordered]@{
    status = $pipelineStatus
    log_dir = $LogDir
    summary_path = $summaryPath
    wrapper_run_id = $runId
    steps = $steps
    operational_summary = $operationalSummary
}

$reportsBlock = [ordered]@{
    ran = $reportsStep.status -ne "skipped"
    status = $reportsStep.status
    skip_reason = $(if ($reportsStep.status -eq "skipped") { $reportsStep.skip_reason } else { $null })
    log_dir = $ReportsLogDir
    summary_path = $reportsStep.summary_path
    partial_error_count = $reportsStep.partial_error_count
    presets = $(if ($reportsSummary) { Get-ObjectValue -Payload $reportsSummary -Name "presets" } else { $null })
    formats = $(if ($reportsSummary) { Get-ObjectValue -Payload $reportsSummary -Name "formats" } else { $null })
    generated_presets = $(if ($reportsSummary) { Get-ObjectValue -Payload $reportsSummary -Name "generated_presets" } else { $null })
}

$briefingBlock = [ordered]@{
    ran = $briefingStep.status -ne "skipped"
    status = $briefingStep.status
    skip_reason = $(if ($briefingStep.status -eq "skipped") { $briefingStep.skip_reason } else { $null })
    log_dir = $BriefingLogDir
    summary_path = $briefingStep.summary_path
    partial_error_count = $briefingStep.partial_error_count
    generated_at = $(if ($briefingSummary) { Get-ObjectValue -Payload $briefingSummary -Name "generated_at" } else { $null })
    json_path = $(if ($briefingSummary) { Get-ObjectValue -Payload $briefingSummary -Name "latest_json_path" } else { $null })
    json_size_bytes = $(if ($briefingSummary) { Get-ObjectValue -Payload $briefingSummary -Name "json_size_bytes" } else { $null })
    txt_path = $(if ($briefingSummary) { Get-ObjectValue -Payload $briefingSummary -Name "latest_text_path" } else { $null })
    txt_size_bytes = $(if ($briefingSummary) { Get-ObjectValue -Payload $briefingSummary -Name "text_size_bytes" } else { $null })
    top_opportunities_count = $(if ($briefingSummary) { Get-ObjectValue -Payload $briefingSummary -Name "top_opportunities_count" } else { $null })
    watchlist_count = $(if ($briefingSummary) { Get-ObjectValue -Payload $briefingSummary -Name "watchlist_count" } else { $null })
    review_flags_count = $(if ($briefingSummary) { Get-ObjectValue -Payload $briefingSummary -Name "review_flags_count" } else { $null })
}

$diffBlock = [ordered]@{
    ran = $diffStep.status -ne "skipped"
    status = $diffStep.status
    skip_reason = $(if ($diffStep.status -eq "skipped") { $diffStep.skip_reason } else { $null })
    log_dir = $DiffLogDir
    summary_path = $diffStep.summary_path
    partial_error_count = $diffStep.partial_error_count
    generated_at = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "generated_at" } else { $null })
    comparison_ready = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "comparison_ready" } else { $null })
    current_snapshot_path = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "current_snapshot_path" } else { $null })
    previous_snapshot_path = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "previous_snapshot_path" } else { $null })
    json_path = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "latest_json_path" } else { $null })
    json_size_bytes = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "json_size_bytes" } else { $null })
    txt_path = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "latest_text_path" } else { $null })
    txt_size_bytes = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "text_size_bytes" } else { $null })
    top_opportunities_entered_count = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "top_opportunities_entered_count" } else { $null })
    top_opportunities_exited_count = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "top_opportunities_exited_count" } else { $null })
    bucket_changes_count = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "bucket_changes_count" } else { $null })
    material_score_changes_count = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "material_score_changes_count" } else { $null })
}

$dashboardBlock = [ordered]@{
    ran = $dashboardStep.status -ne "skipped"
    status = $dashboardStep.status
    skip_reason = $(if ($dashboardStep.status -eq "skipped") { $dashboardStep.skip_reason } else { $null })
    log_dir = $DashboardLogDir
    summary_path = $dashboardStep.summary_path
    partial_error_count = $dashboardStep.partial_error_count
    generated_at = $(if ($dashboardSummary) { Get-ObjectValue -Payload $dashboardSummary -Name "generated_at" } else { $null })
    dashboard_path = $(if ($dashboardSummary) { Get-ObjectValue -Payload $dashboardSummary -Name "dashboard_path" } else { $null })
    html_size_bytes = $(if ($dashboardSummary) { Get-ObjectValue -Payload $dashboardSummary -Name "html_size_bytes" } else { $null })
    overall_status = $(if ($dashboardSummary) { Get-ObjectValue -Payload $dashboardSummary -Name "overall_status" } else { $null })
    total_top_opportunities = $(if ($dashboardSummary) { Get-ObjectValue -Payload $dashboardSummary -Name "total_top_opportunities" } else { $null })
    total_watchlist = $(if ($dashboardSummary) { Get-ObjectValue -Payload $dashboardSummary -Name "total_watchlist" } else { $null })
    warning_reason = $(if ($dashboardSummary) { Get-ObjectValue -Payload $dashboardSummary -Name "warning_reason" } else { $null })
}

$summary = [ordered]@{
    status = $overallStatus
    started_at = $startedAt.ToString("o")
    finished_at = $finishedAt.ToString("o")
    duration_seconds = $durationSeconds
    repo_root = $repoRoot
    api_dir = $ApiDir
    python_path = $PythonPath
    log_dir = $LogDir
    limit = $(if ($Limit -gt 0) { $Limit } else { $null })
    frequency_recommendation_minutes = 120
    subset = [ordered]@{
        discovery_scope = "nba"
        market_type = "winner"
        active_only = $true
        closed_only = $false
    }
    partial_error_count = $partialErrorCount
    logs = [ordered]@{
        master_summary_path = $summaryPath
        pipeline_log_dir = $LogDir
        reports_log_dir = $ReportsLogDir
        reports_summary_path = $reportsStep.summary_path
        briefing_log_dir = $BriefingLogDir
        briefing_summary_path = $briefingStep.summary_path
        briefing_json_path = $(if ($briefingSummary) { Get-ObjectValue -Payload $briefingSummary -Name "latest_json_path" } else { $null })
        briefing_txt_path = $(if ($briefingSummary) { Get-ObjectValue -Payload $briefingSummary -Name "latest_text_path" } else { $null })
        diff_log_dir = $DiffLogDir
        diff_summary_path = $diffStep.summary_path
        diff_json_path = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "latest_json_path" } else { $null })
        diff_txt_path = $(if ($diffSummary) { Get-ObjectValue -Payload $diffSummary -Name "latest_text_path" } else { $null })
        dashboard_log_dir = $DashboardLogDir
        dashboard_summary_path = $dashboardStep.summary_path
        dashboard_path = $(if ($dashboardSummary) { Get-ObjectValue -Payload $dashboardSummary -Name "dashboard_path" } else { $null })
    }
    pipeline = $pipelineBlock
    reports = $reportsBlock
    briefing = $briefingBlock
    diff = $diffBlock
    dashboard = $dashboardBlock
    operational_summary = $operationalSummary
    steps = $steps
}

$summaryJson = $summary | ConvertTo-Json -Depth 12
$summaryJson | Set-Content -Path $summaryPath -Encoding utf8
$summaryJson | Set-Content -Path $latestSummaryPath -Encoding utf8

$historyLine = "{0}`t{1}`tsnapshots={2}`tevidence={3}`tscoring={4}`treports={5}`tbriefing={6}`tdiff={7}`tdashboard={8}`tpartial_errors={9}" -f `
    $startedAt.ToString("o"), `
    $overallStatus, `
    $steps.snapshots.status, `
    $steps.evidence.status, `
    $steps.scoring.status, `
    $reportsStep.status, `
    $briefingStep.status, `
    $diffStep.status, `
    $dashboardStep.status, `
    $partialErrorCount
Add-Content -Path $historyPath -Value $historyLine -Encoding utf8

Write-Host "Pipeline + Reports + Briefing + Diff + Dashboard run: $overallStatus"
Write-Host "Started at: $($startedAt.ToString("o"))"
Write-Host "Finished at: $($finishedAt.ToString("o"))"
Write-Host "Duration seconds: $durationSeconds"
Write-Host "Subset: nba / winner"
Write-Host "Snapshots step: $($steps.snapshots.status)"
Write-Host "Evidence step: $($steps.evidence.status)"
Write-Host "Scoring step: $($steps.scoring.status)"
Write-Host "Reports step: $($reportsStep.status)"
Write-Host "Briefing step: $($briefingStep.status)"
Write-Host "Diff step: $($diffStep.status)"
Write-Host "Dashboard step: $($dashboardStep.status)"
if ($evidenceSummary) {
    Write-Host "Evidence eligible / processed: $((Get-ObjectValue -Payload $evidenceSummary -Name 'markets_eligible_for_evidence')) / $((Get-ObjectValue -Payload $evidenceSummary -Name 'markets_processed'))"
    Write-Host "Evidence skipped non-matchable / unsupported: $((Get-ObjectValue -Payload $evidenceSummary -Name 'markets_skipped_non_matchable')) / $((Get-ObjectValue -Payload $evidenceSummary -Name 'markets_skipped_unsupported_shape'))"
    Write-Host "Evidence markets with odds / news match: $((Get-ObjectValue -Payload $evidenceSummary -Name 'markets_with_odds_match')) / $((Get-ObjectValue -Payload $evidenceSummary -Name 'markets_with_news_match'))"
}
if ($scoringSummary) {
    Write-Host "Scoring with evidence / fallback: $((Get-ObjectValue -Payload $scoringSummary -Name 'markets_scored_with_any_evidence')) / $((Get-ObjectValue -Payload $scoringSummary -Name 'markets_scored_with_snapshot_fallback'))"
    Write-Host "Scoring used odds items / news items: $((Get-ObjectValue -Payload $scoringSummary -Name 'used_odds_count')) / $((Get-ObjectValue -Payload $scoringSummary -Name 'used_news_count'))"
}
if ($reportsSummary) {
    $reportPresetSummaries = Get-ObjectValue -Payload $reportsSummary -Name "generated_presets"
    if ($null -ne $reportPresetSummaries) {
        foreach ($presetSummary in @($reportPresetSummaries)) {
            Write-Host "Report preset $($presetSummary.preset): items=$($presetSummary.item_count)"
        }
    }
}
elseif ($reportsStep.status -eq "skipped") {
    Write-Host "Reports skipped reason: $($reportsStep.skip_reason)"
}
if ($briefingSummary) {
    Write-Host "Briefing latest JSON: $((Get-ObjectValue -Payload $briefingSummary -Name 'latest_json_path'))"
    Write-Host "Briefing latest TXT: $((Get-ObjectValue -Payload $briefingSummary -Name 'latest_text_path'))"
    Write-Host "Briefing top / watchlist / review: $((Get-ObjectValue -Payload $briefingSummary -Name 'top_opportunities_count')) / $((Get-ObjectValue -Payload $briefingSummary -Name 'watchlist_count')) / $((Get-ObjectValue -Payload $briefingSummary -Name 'review_flags_count'))"
}
elseif ($briefingStep.status -eq "skipped") {
    Write-Host "Briefing skipped reason: $($briefingStep.skip_reason)"
}
if ($diffSummary) {
    Write-Host "Diff latest JSON: $((Get-ObjectValue -Payload $diffSummary -Name 'latest_json_path'))"
    Write-Host "Diff latest TXT: $((Get-ObjectValue -Payload $diffSummary -Name 'latest_text_path'))"
    Write-Host "Diff entered / exited / bucket / material: $((Get-ObjectValue -Payload $diffSummary -Name 'top_opportunities_entered_count')) / $((Get-ObjectValue -Payload $diffSummary -Name 'top_opportunities_exited_count')) / $((Get-ObjectValue -Payload $diffSummary -Name 'bucket_changes_count')) / $((Get-ObjectValue -Payload $diffSummary -Name 'material_score_changes_count'))"
}
elseif ($diffStep.status -eq "skipped") {
    Write-Host "Diff skipped reason: $($diffStep.skip_reason)"
}
if ($dashboardSummary) {
    Write-Host "Dashboard latest HTML: $((Get-ObjectValue -Payload $dashboardSummary -Name 'dashboard_path'))"
    Write-Host "Dashboard overall status / top / watchlist: $((Get-ObjectValue -Payload $dashboardSummary -Name 'overall_status')) / $((Get-ObjectValue -Payload $dashboardSummary -Name 'total_top_opportunities')) / $((Get-ObjectValue -Payload $dashboardSummary -Name 'total_watchlist'))"
}
elseif ($dashboardStep.status -eq "skipped") {
    Write-Host "Dashboard skipped reason: $($dashboardStep.skip_reason)"
}
Write-Host "Partial errors: $partialErrorCount"
Write-Host "Master summary log: $summaryPath"

if ($overallStatus -eq "error") {
    exit 1
}

exit 0
