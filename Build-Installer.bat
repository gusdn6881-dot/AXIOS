@echo off
title AXIOS CLI - Packaging Installer
echo ===================================================
echo  Packaging AXIOS CLI and placing it in workspace root...
echo ===================================================
cd /d "%~dp0desktop"

:: Install dependencies if not present
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
)

:: Run electron-builder packaging
echo [INFO] Packaging Electron application...
call npm run dist

:: Copy the installer to the root folder
echo ===================================================
echo  Copying installer to workspace root...
echo ===================================================
cd /d "%~dp0"
copy /y "desktop\release\AXIOS-CLI-*-Setup.exe" ".\"

if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Installer successfully created in AXIOS CLI folder!
) else (
    echo [ERROR] Failed to copy the installer file.
)

pause
