@echo off
title AXIOS CLI - Unregister Auto-Updater
echo ===================================================
echo  Removing AXIOS CLI Background Auto-Updater...
echo ===================================================

echo [INFO] Deleting Windows Scheduled Task 'AXIOS-CLI-AutoUpdater'...
schtasks /delete /tn "AXIOS-CLI-AutoUpdater" /f

if %ERRORLEVEL% equ 0 (
    echo ===================================================
    echo [SUCCESS] Auto-updater task removed successfully!
    echo ===================================================
) else (
    echo [INFO] Task not found or could not be deleted.
)

pause
