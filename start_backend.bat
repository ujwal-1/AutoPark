@echo off
title AutoPark Backend (FastAPI on Port 8000)
echo ====================================================
echo        AutoPark Backend Server Launcher
echo ====================================================

cd /d "%~dp0backend"

:: Detect Python
if exist "%~dp0.venv\Scripts\python.exe" (
    set "PY=%~dp0.venv\Scripts\python.exe"
) else if exist "%~dp0venv\Scripts\python.exe" (
    set "PY=%~dp0venv\Scripts\python.exe"
) else if exist "%~dp0backend\.venv\Scripts\python.exe" (
    set "PY=%~dp0backend\.venv\Scripts\python.exe"
) else if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" (
    set "PY=%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe"
) else (
    set "PY=python"
)

echo Using Python: %PY%
echo Starting Uvicorn on 0.0.0.0:8000...
echo.

"%PY%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Backend exited with error code %ERRORLEVEL%.
    pause
)
