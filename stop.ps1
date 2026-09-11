# Stop both servers started by start.ps1
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }

Write-Host "Stopping CV Screener..." -ForegroundColor Cyan
foreach ($port in @(8000, 3000)) {
    $lines = netstat -ano | Select-String ":$port\s"
    if (-not $lines) { Write-Host "Nothing on port $port" }
    foreach ($line in $lines) {
        if ($line -match "\s(\d+)\s*$") {
            $procId = $Matches[1]
            try {
                $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($proc) {
                    Stop-Process -Id $procId -Force
                    Write-Host "Killed PID $procId on port $port ($($proc.ProcessName))"
                }
            } catch { Write-Host "Failed to kill PID $procId : $_" -ForegroundColor Yellow }
        }
    }
}
Write-Host "Done. Logs kept: backend\uvicorn.log, frontend\frontend.log" -ForegroundColor Green
