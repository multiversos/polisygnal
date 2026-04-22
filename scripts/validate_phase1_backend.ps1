param(
    [string]$PythonExe = "",
    [switch]$SkipInstall,
    [switch]$SkipTests,
    [switch]$SkipSmoke,
    [switch]$SkipDatabaseSetup
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)

    Write-Host "[phase1] $Message"
}

function Invoke-Checked {
    param(
        [string]$Description,
        [scriptblock]$Command
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description fallo con codigo de salida $LASTEXITCODE"
    }
}

function Find-PythonExe {
    param([string]$Preferred)

    if ($Preferred) {
        if (Test-Path -LiteralPath $Preferred) {
            return (Resolve-Path -LiteralPath $Preferred).Path
        }

        throw "No encontre Python en la ruta proporcionada: $Preferred"
    }

    $directCandidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe"
    )

    foreach ($candidate in $directCandidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    $command = Get-Command python -ErrorAction SilentlyContinue
    if ($command -and $command.Source -notlike "*WindowsApps*") {
        return $command.Source
    }

    $found = Get-ChildItem -Path "$env:LOCALAPPDATA\Programs\Python" -Recurse -Filter python.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notlike "*\Lib\venv\scripts\nt\python.exe" } |
        Sort-Object FullName -Descending |
        Select-Object -First 1 -ExpandProperty FullName

    if ($found) {
        return $found
    }

    throw "No encontre un interprete Python usable. Instala Python 3.11+ o pasa -PythonExe."
}

function Read-DotEnv {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $values
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $pair = $trimmed -split "=", 2
        if ($pair.Count -eq 2) {
            $values[$pair[0].Trim()] = $pair[1].Trim()
        }
    }

    return $values
}

function Find-PsqlExe {
    $command = Get-Command psql -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidate = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like "*\bin\psql.exe" } |
        Sort-Object FullName -Descending |
        Select-Object -First 1 -ExpandProperty FullName

    return $candidate
}

function Ensure-DatabaseExists {
    param(
        [string]$PsqlExe,
        [string]$DatabaseUrl
    )

    if ($DatabaseUrl -notmatch "^postgresql(?:\+\w+)?://([^:]+):([^@]+)@([^:/]+):(\d+)/(.+)$") {
        throw "La URL de base de datos no tiene un formato PostgreSQL compatible: $DatabaseUrl"
    }

    $dbUser = $matches[1]
    $dbPassword = $matches[2]
    $dbHost = $matches[3]
    $dbPort = $matches[4]
    $dbName = $matches[5]

    $env:PGPASSWORD = $dbPassword
    try {
        $exists = & $PsqlExe -U $dbUser -h $dbHost -p $dbPort -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName';"
        if (-not $exists.Trim()) {
            Write-Step "Creando base de datos $dbName"
            & $PsqlExe -U $dbUser -h $dbHost -p $dbPort -d postgres -c "CREATE DATABASE $dbName;" | Out-Null
        }
        else {
            Write-Step "La base de datos $dbName ya existe"
        }
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$apiDir = Join-Path $repoRoot "apps\api"
$venvDir = Join-Path $apiDir ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$envExamplePath = Join-Path $apiDir ".env.example"
$envPath = Join-Path $apiDir ".env"
$requirementsPath = Join-Path $apiDir "requirements.txt"

$resolvedPython = Find-PythonExe -Preferred $PythonExe
Write-Step "Usando Python en $resolvedPython"

if (-not (Test-Path -LiteralPath $venvPython)) {
    Write-Step "Creando entorno virtual"
    & $resolvedPython -m venv $venvDir
}
else {
    Write-Step "Reutilizando entorno virtual existente"
}

if (-not (Test-Path -LiteralPath $envPath)) {
    Write-Step "Creando .env desde .env.example"
    Copy-Item -LiteralPath $envExamplePath -Destination $envPath
}
else {
    Write-Step "Reutilizando .env existente"
}

if (-not $SkipInstall) {
    Write-Step "Actualizando pip"
    Invoke-Checked "La actualizacion de pip" { & $venvPython -m pip install --upgrade pip }
    Write-Step "Instalando dependencias del backend"
    Invoke-Checked "La instalacion de dependencias" { & $venvPython -m pip install -r $requirementsPath }
}

$envValues = Read-DotEnv -Path $envPath
$databaseUrl = $envValues["POLYSIGNAL_DATABASE_URL"]
if (-not $databaseUrl) {
    $databaseUrl = "postgresql+psycopg://postgres:postgres@localhost:5432/polysignal"
}

if (-not $SkipDatabaseSetup -and $databaseUrl -like "postgresql*") {
    $psqlExe = Find-PsqlExe
    if (-not $psqlExe) {
        throw "No encontre psql.exe para preparar la base de datos."
    }

    Write-Step "Verificando disponibilidad de la base PostgreSQL"
    Ensure-DatabaseExists -PsqlExe $psqlExe -DatabaseUrl $databaseUrl
}

Push-Location $apiDir
try {
    Write-Step "Ejecutando migraciones Alembic"
    Invoke-Checked "Las migraciones Alembic" { & $venvPython -m alembic upgrade head }

    if (-not $SkipTests) {
        Write-Step "Corriendo tests de humo"
        Invoke-Checked "Los tests de humo" { & $venvPython -m pytest }
    }

    if (-not $SkipSmoke) {
        Write-Step "Levantando FastAPI para smoke test HTTP"
        $stdoutLog = Join-Path $apiDir "uvicorn-phase1.stdout.log"
        $stderrLog = Join-Path $apiDir "uvicorn-phase1.stderr.log"
        $proc = Start-Process -FilePath $venvPython -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000" -WorkingDirectory $apiDir -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
        try {
            Start-Sleep -Seconds 4
            $smokeResult = & $venvPython -c "import json, urllib.request; health = json.loads(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode()); markets = urllib.request.urlopen('http://127.0.0.1:8000/markets').read().decode(); print(json.dumps({'health': health, 'markets_raw': markets}))"
            if ($LASTEXITCODE -ne 0) {
                throw "El smoke test HTTP fallo"
            }
            Write-Step "Smoke test OK: $smokeResult"
        }
        finally {
            if ($proc -and -not $proc.HasExited) {
                Stop-Process -Id $proc.Id -Force
            }
            Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue
        }
    }
}
finally {
    Pop-Location
}

Write-Step "Validacion completa de Fase 1 finalizada"
