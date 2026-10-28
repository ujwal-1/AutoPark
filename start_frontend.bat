@echo off
title AutoPark Frontend Dashboard (Port 3000)
echo ====================================================
echo        AutoPark Frontend Dashboard Launcher
echo ====================================================

cd /d "%~dp0frontend"

echo Starting Next.js development server on http://localhost:3000...
echo.

call npm.cmd run dev

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Frontend exited with error code %ERRORLEVEL%.
    pause
)
