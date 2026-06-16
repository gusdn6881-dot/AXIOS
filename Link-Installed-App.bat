@echo off
title AXIOS CLI - Link Installed App to Workspace
echo ===================================================
echo  Connecting Installed App to Development Directory...
echo ===================================================

set "INSTALLED_DIR=C:\Users\sck03\AppData\Local\Programs\AXIOS-CLI\resources"
set "DEV_DIR=%~dp0desktop"

if not exist "%INSTALLED_DIR%" (
    echo [ERROR] Installed AXIOS CLI directory not found!
    echo Please make sure the app is installed at: %INSTALLED_DIR%
    pause
    exit /b 1
)

:: Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Running link commands...
)

:: Rename app.asar if it exists
if exist "%INSTALLED_DIR%\app.asar" (
    echo [INFO] Backing up app.asar to app.asar.backup...
    ren "%INSTALLED_DIR%\app.asar" "app.asar.backup"
)

:: Delete existing junction link if it exists
if exist "%INSTALLED_DIR%\app" (
    echo [INFO] Removing existing link...
    rmdir "%INSTALLED_DIR%\app"
)

:: Create directory junction
echo [INFO] Creating directory junction pointing to %DEV_DIR%...
mklink /J "%INSTALLED_DIR%\app" "%DEV_DIR%"

if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Installed app is now connected to the development directory!
    echo 1. Keep "Watch-Dev.bat" running in the background.
    echo 2. Open your regular AXIOS CLI.
    echo 3. Any changes you make will apply immediately (or by pressing Ctrl+R to reload).
) else (
    echo [ERROR] Failed to create link.
)

pause
