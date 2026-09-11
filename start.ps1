# One-click starter - no Docker required (SQLite mode)
# Run:  powershell -ExecutionPolicy Bypass -File start.ps1
# Or double-click start.bat

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
Set-Location $root

Write-Host "== CV Screener - Easy Start ==" -ForegroundColor Cyan

# 1) Ensure env files exist
if (-not (Test-Path "$root\backend\.env")) {
    Copy-Item "$root\backend\.env.example" "$root\backend\.env"
    Write-Host "Created backend\.env from .env.example" -ForegroundColor Yellow
}
if (-not (Test-Path "$root\frontend\.env")) {
    if (Test-Path "$root\frontend\.env.example") { Copy-Item "$root\frontend\.env.example" "$root\frontend\.env" }
    else { "NEXT_PUBLIC_API_URL=http://localhost:8000" | Set-Content "$root\frontend\.env" }
    Write-Host "Created frontend\.env" -ForegroundColor Yellow
}
# Also ensure frontend .env.local for Next.js
if (-not (Test-Path "$root\frontend\.env.local") -and (Test-Path "$root\frontend\.env")) {
    Copy-Item "$root\frontend\.env" "$root\frontend\.env.local" -Force
}

# 2) Switch backend/.env to SQLite for local run (Docker compose overrides this anyway)
$envPath = "$root\backend\.env"
$envText = Get-Content $envPath -Raw
if ($envText -match "postgresql\+asyncpg://postgres:postgres@db:5432") {
    $envText = $envText -replace 'DATABASE_URL=.*', 'DATABASE_URL=sqlite+aiosqlite:///./dev.db'
    Set-Content -Path $envPath -Value $envText -NoNewline
    Write-Host "Patched backend/.env DATABASE_URL -> sqlite (local mode). Docker still uses Postgres via docker-compose.yml" -ForegroundColor Yellow
}

# 3) Check python / node
try { $pyVer = python --version 2>&1; Write-Host "Python: $pyVer" } catch { Write-Host "ERROR: python not found in PATH" -ForegroundColor Red; exit 1 }
try { $nodeVer = node --version 2>&1; Write-Host "Node: $nodeVer" } catch { Write-Host "WARN: node not found - frontend will not start" -ForegroundColor Yellow }

# 4) Install backend deps if needed (light check)
python -c "import fastapi" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing backend deps..." -ForegroundColor Yellow
    python -m pip install -r "$root\backend\requirements-dev.txt" --quiet
}

# 5) Init SQLite DB if missing
if (-not (Test-Path "$root\backend\dev.db")) {
    Write-Host "Initializing SQLite DB (backend\dev.db)..." -ForegroundColor Yellow
    $initPy = @"
import asyncio, sys
sys.path.insert(0, r'$root\backend')
from sqlalchemy.ext.asyncio import create_async_engine
from app.db.session import Base
import app.models
async def init():
    engine = create_async_engine('sqlite+aiosqlite:///$($root -replace '\\','\\')\\backend\\dev.db')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print('DB ready')
asyncio.run(init())
"@
    $initPy | python -
}

# 6) Kill any previous servers on 8000 / 3000 (optional, safe)
foreach ($port in @(8000, 3000)) {
    $conns = netstat -ano | Select-String ":$port\s"
    foreach ($line in $conns) {
        if ($line -match "\s(\d+)\s*$") {
            $procId = $Matches[1]
            try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue; Write-Host "Stopped old process on port $port (PID $procId)" } catch {}
        }
    }
    Start-Sleep -Milliseconds 500
}

# 7) Start backend (background)
Write-Host "`nStarting backend on http://localhost:8000 ..." -ForegroundColor Green
$backendLog = "$root\backend\uvicorn.log"
$backendErr = "$root\backend\uvicorn.err"
# Ensure PYTHONPATH includes backend dir
$env:PYTHONPATH = "$root\backend"
Start-Process -FilePath "python" -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000","--reload" -WorkingDirectory "$root\backend" -RedirectStandardOutput $backendLog -RedirectStandardError $backendErr -WindowStyle Hidden
Start-Sleep -Seconds 3
try {
    $h = Invoke-WebRequest -Uri http://127.0.0.1:8000/health -UseBasicParsing -TimeoutSec 5
    Write-Host "Backend OK: $($h.Content)  Docs: http://localhost:8000/docs" -ForegroundColor Green
} catch {
    Write-Host "Backend failed to start - check $backendErr" -ForegroundColor Red
    Get-Content $backendErr -Tail 30 | Write-Host
}

# 8) Start frontend (background)
if (Get-Command npm -ErrorAction SilentlyContinue) {
    if (-not (Test-Path "$root\frontend\node_modules")) {
        Write-Host "Installing frontend deps (npm install) - first run takes ~1 min..." -ForegroundColor Yellow
        Push-Location "$root\frontend"; npm install; Pop-Location
    }
    Write-Host "Starting frontend on http://localhost:3000 ..." -ForegroundColor Green
    $feLog = "$root\frontend\frontend.log"
    Start-Process -FilePath "cmd" -ArgumentList "/c","npm run dev > `"$feLog`" 2>&1" -WorkingDirectory "$root\frontend" -WindowStyle Hidden
    Write-Host "Frontend starting in background (log: $feLog). Wait ~10s then open http://localhost:3000" -ForegroundColor Green
} else {
    Write-Host "Skipping frontend (npm not found)" -ForegroundColor Yellow
}

Write-Host "`n== Done ==" -ForegroundColor Cyan
Write-Host "Backend : http://localhost:8000  (health: /health, docs: /docs)"
Write-Host "Frontend: http://localhost:3000"
Write-Host "Logs    : backend/uvicorn.log , backend/uvicorn.err , frontend/frontend.log"
Write-Host "Stop    : powershell -File stop.ps1  or  stop.bat"
