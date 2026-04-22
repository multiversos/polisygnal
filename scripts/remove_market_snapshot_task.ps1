[CmdletBinding()]
param(
    [string]$TaskName = "PolySignal-Market-Snapshots"
)

$ErrorActionPreference = "Stop"

$deleteOutput = schtasks /Delete /TN $TaskName /F 2>&1
$deleteExitCode = $LASTEXITCODE
if ($deleteExitCode -ne 0) {
    $deleteText = ($deleteOutput | Out-String).Trim()
    throw "No se pudo eliminar la tarea programada. $deleteText"
}

Write-Host ($deleteOutput | Out-String).Trim()
