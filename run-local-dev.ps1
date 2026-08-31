$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$UvBin = Join-Path $env:USERPROFILE ".local\bin"
$SystemPython = Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe"
$LogsDir = Join-Path $ProjectRoot ".codex\logs"
$OutLog = Join-Path $LogsDir "pnpm-dev.out.log"
$ErrLog = Join-Path $LogsDir "pnpm-dev.err.log"

New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

if (Test-Path $UvBin) {
    $env:Path = "$UvBin;$env:Path"
}

$env:NODE_OPTIONS = "--use-system-ca"
$env:UV_SYSTEM_CERTS = "1"
$env:UV_PYTHON = $SystemPython
$env:PYRIGHT_PYTHON_IGNORE_WARNINGS = "1"

Set-Location $ProjectRoot

function Stop-ExistingDevProcesses {
    $needles = @(
        "pnpm.cjs dev",
        "vite.js",
        "electron.exe",
        "ltx2_server.py",
        "run-dev.ps1"
    )

    $existing = Get-CimInstance Win32_Process | Where-Object {
        if (-not $_.CommandLine -or $_.ProcessId -eq $PID) {
            return $false
        }

        $commandLine = $_.CommandLine
        if (-not $commandLine.Contains($ProjectRoot)) {
            return $false
        }

        foreach ($needle in $needles) {
            if ($commandLine.Contains($needle)) {
                return $true
            }
        }
        return $false
    }

    foreach ($process in $existing) {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }

    if ($existing) {
        Write-Host "Stopped existing LTX Desktop dev processes." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
}

Write-Host "Starting LTX Desktop local dev..." -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host "Logs:"
Write-Host "  $OutLog"
Write-Host "  $ErrLog"
Write-Host ""

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "pnpm was not found. Installing pnpm@10.30.3..." -ForegroundColor Yellow
    $env:NODE_OPTIONS = "--use-system-ca"
    npm install -g pnpm@10.30.3
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "uv was not found. Install it with:" -ForegroundColor Red
    Write-Host "powershell -ExecutionPolicy ByPass -c `"irm https://astral.sh/uv/install.ps1 | iex`""
    Read-Host "Press Enter to close"
    exit 1
}

if (-not (Test-Path $SystemPython)) {
    Write-Host "System Python 3.13 was not found at:" -ForegroundColor Red
    Write-Host $SystemPython
    Write-Host "Install Python 3.13 from python.org, then run this script again."
    Read-Host "Press Enter to close"
    exit 1
}

Stop-ExistingDevProcesses

$venvPython = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    $venvBase = & $venvPython -c "import sys; print(sys.base_prefix)" 2>$null
    if ($venvBase -like "*\AppData\Roaming\uv\python\*") {
        Write-Host "Recreating backend venv with system Python to avoid Windows OpenSSL crashes..." -ForegroundColor Yellow
        Remove-Item -LiteralPath (Join-Path $ProjectRoot "backend\.venv") -Recurse -Force
    }
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing JavaScript dependencies..." -ForegroundColor Yellow
    pnpm install --frozen-lockfile
}

if (-not (Test-Path "backend\.venv")) {
    Write-Host "Installing Python backend dependencies..." -ForegroundColor Yellow
    Push-Location "backend"
    uv sync --frozen --python $SystemPython --extra dev --extra test
    Pop-Location
}

Clear-Content $OutLog -ErrorAction SilentlyContinue
Clear-Content $ErrLog -ErrorAction SilentlyContinue

Write-Host "Launching app. Keep this window open while using LTX Desktop." -ForegroundColor Green
Write-Host "Press Ctrl+C in this window to stop it." -ForegroundColor DarkGray
Write-Host ""

pnpm dev 2>&1 | Tee-Object -FilePath $OutLog -Append
