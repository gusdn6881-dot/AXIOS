@echo off
title AXIOS CLI - Real-time Auto Build (Watch Mode)
echo ===================================================
echo  Checking for Upstream Updates (wonseokjung/connect-ai)...
echo ===================================================
cd /d "%~dp0"

:: Check if Python is installed
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python and try again.
    pause
    exit /b 1
)

call python scripts/upgrade_axios_cli.py
if %ERRORLEVEL% neq 0 (
    echo [ERROR] upgrade_axios_cli.py failed to run.
    pause
    exit /b 1
)

echo ===================================================
echo  Starting Real-time Auto Builder...
echo  (Any changes you make will be built instantly!)
echo ===================================================
cd /d "%~dp0desktop"

:: Check if Node is installed
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js and try again.
    pause
    exit /b 1
)

:: Install dependencies if not present
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

:: Run watch mode
call node watch.mjs
if %ERRORLEVEL% neq 0 (
    echo [ERROR] watch.mjs crashed.
    pause
    exit /b 1
)
pause
