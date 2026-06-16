@echo off
title AXIOS CLI - Developer Mode
echo ===================================================
echo  Starting AXIOS CLI in Developer Mode...
echo  (Code changes will be compiled and applied immediately)
echo ===================================================
cd /d "%~dp0desktop"

:: Check if node_modules exists, if not, run npm install
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
)

:: Run the build and start Electron
echo [INFO] Building and starting Electron...
call npm start
pause
