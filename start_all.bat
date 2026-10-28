@echo off
title AutoPark System Launcher
echo ====================================================
echo        AutoPark Smart Parking System Launcher
echo ====================================================
echo.
echo Launching Backend (Port 8000) and Frontend (Port 3000)...
echo.

start "AutoPark Backend" cmd /c "%~dp0start_backend.bat"
timeout /t 3 /nobreak >nul
start "AutoPark Frontend" cmd /c "%~dp0start_frontend.bat"

echo System launched!
echo - Backend API:  http://localhost:8000
echo - API Docs:     http://localhost:8000/docs
echo - Health Check: http://localhost:8000/health
echo - Dashboard:    http://localhost:3000
echo.
pause
