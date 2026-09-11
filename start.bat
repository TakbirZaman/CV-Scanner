@echo off
REM Double-click to start backend + frontend (no Docker needed)
powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1"
pause
