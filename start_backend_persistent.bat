@echo off
title AutoPark Backend Persistent Runner
echo ====================================================
echo      AutoPark Backend Persistent Startup Script
echo ====================================================

cd /d "%~dp0backend"

:: Check for existing venvs or use system python
if exist "%~dp0.venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
) else if exist "%~dp0venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0venv\Scripts\python.exe"
) else if exist "%~dp0backend\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0backend\.venv\Scripts\python.exe"
) else if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo Using Python executable: %PYTHON_EXE%
echo Starting persistent backend supervisor on 0.0.0.0:8000...
echo Press Ctrl+C at any time to stop.
echo.

"%PYTHON_EXE%" run_persistent_backend.py

pause
