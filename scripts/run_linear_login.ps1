[CmdletBinding()]
param(
    [string]$ClientId = "",
    [string]$ClientSecret = "",
    [string]$RedirectUri = "",
    [string]$Scopes = "",
    [string]$Actor = "",
    [switch]$NoBrowser,
    [int]$TimeoutSeconds = 180,
    [string]$PythonPath = "",
    [string]$ApiDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
if ([string]::IsNullOrWhiteSpace($ApiDir)) {
    $ApiDir = Join-Path $repoRoot "apps\api"
}
if ([string]::IsNullOrWhiteSpace($PythonPath)) {
    $PythonPath = Join-Path $ApiDir ".venv\Scripts\python.exe"
}

if (-not (Test-Path -LiteralPath $ApiDir)) {
    throw "No existe el directorio de la API: $ApiDir"
}
if (-not (Test-Path -LiteralPath $PythonPath)) {
    throw "No existe el ejecutable de Python esperado: $PythonPath"
}

$commandArgs = @("-m", "app.commands.login_linear", "--timeout-seconds", $TimeoutSeconds.ToString())
if (-not [string]::IsNullOrWhiteSpace($ClientId)) {
    $commandArgs += @("--client-id", $ClientId)
}
if (-not [string]::IsNullOrWhiteSpace($ClientSecret)) {
    $commandArgs += @("--client-secret", $ClientSecret)
}
if (-not [string]::IsNullOrWhiteSpace($RedirectUri)) {
    $commandArgs += @("--redirect-uri", $RedirectUri)
}
if (-not [string]::IsNullOrWhiteSpace($Scopes)) {
    $commandArgs += @("--scopes", $Scopes)
}
if (-not [string]::IsNullOrWhiteSpace($Actor)) {
    $commandArgs += @("--actor", $Actor)
}
if ($NoBrowser) {
    $commandArgs += "--no-browser"
}

Push-Location $ApiDir
try {
    & $PythonPath @commandArgs
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

exit $exitCode
