@echo off
title AXIOS CLI - Auto Upstream Sync and Build
echo ===================================================
echo  Starting AXIOS CLI Auto Upstream Sync...
echo ===================================================

:: Ensure we are in the script's directory (crucial when run as Administrator)
cd /d "%~dp0"

:: Check if git, python are in PATH
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git is not installed or not in PATH!
    pause
    exit /b 1
)
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b 1
)

:: 1. Fetch from upstream (wonseokjung/connect-ai)
echo [INFO] Fetching updates from upstream (connect-ai)...
git fetch upstream

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to fetch from upstream. Check internet connection or upstream remote configuration.
    pause
    exit /b 1
)

:: 2. Try merging upstream/main into current branch
echo [INFO] Merging upstream/main...
git merge upstream/main -m "Merge upstream updates"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [WARNING] Merge conflicts detected!
    echo Please open your editor (VS Code / Cursor), resolve the conflicts, 
    echo commit the changes, and then run this script again.
    pause
    exit /b 1
)

:: 3. Run the Upgrade & Rebrand Python Script
echo [INFO] Running upgrade and rebranding script...
python scripts/upgrade_axios_cli.py

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Rebranding or bundle merge failed.
    pause
    exit /b 1
)

:: 4. Build desktop app
echo [INFO] Building AXIOS CLI Desktop App...
cd desktop

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    cd ..
    pause
    exit /b 1
)

call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build failed.
    cd ..
    pause
    exit /b 1
)
cd ..

:: 5. Connect to Installed App (npm link equivalent for setup)
echo [INFO] Linking development changes to installed app path...
call Link-Installed-App.bat
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Link-Installed-App.bat exited with error.
)

:: 6. Push to origin (your AXIOS repo)
echo [INFO] Pushing updated AXIOS CLI codebase to your GitHub...
git add .
git commit -m "Auto-sync with upstream connect-ai updates"
git push origin main
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Pushing to origin (your GitHub) failed. Please check your credentials.
)

echo ===================================================
echo [SUCCESS] AXIOS CLI successfully synced, built, 
echo           linked, and backed up to GitHub!
echo ===================================================
pause
