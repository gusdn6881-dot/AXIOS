@echo off
title AXIOS CLI - Register Auto-Updater
echo ===================================================
echo  Registering AXIOS CLI Background Auto-Updater...
echo ===================================================

cd /d "%~dp0"

:: Check for pythonw
where pythonw >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] pythonw is not in your PATH. 
    echo Please make sure Python is installed and added to environment variables.
    pause
    exit /b 1
)

:: Create task in Task Scheduler to run every hour
echo [INFO] Registering Windows Scheduled Task 'AXIOS-CLI-AutoUpdater'...
schtasks /create /tn "AXIOS-CLI-AutoUpdater" /tr "pythonw.exe \"%~dp0scripts\auto_update_worker.py\"" /sc hourly /mo 1 /f

if %ERRORLEVEL% equ 0 (
    echo ===================================================
    echo [SUCCESS] Auto-updater task registered successfully!
    echo           It will run silently in the background 
    echo           every 1 hour to check for updates.
    echo ===================================================
) else (
    echo [ERROR] Failed to register Scheduled Task. 
    echo Try running this script as Administrator.
)

pause
