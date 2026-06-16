@echo off
title TradingAgents - Free Auto Server
color 0b

echo =====================================================================
echo    TradingAgents Multi-Agent Hedge Fund Simulator (100%% FREE)
echo =====================================================================
echo.

:: Move to project directory
cd /d "c:\Users\sck03\.antigravity\extensions\axios ai\_company\projects\trading-agents"

:: Launch production Express server
echo [1/3] Starting Node.js server on port 3000...
start /b cmd /c "npm run start"

:: Wait for server initialization
echo.
echo [2/3] Waiting for server boot (5 seconds)...
ping 127.0.0.1 -n 6 >nul
echo.

:: Show local network IP for same-WiFi access
echo =====================================================================
echo   [WiFi] Same network access (URL never changes):
echo   http://192.168.55.204:3000
echo =====================================================================
echo.

:: Open Cloudflare Tunnel for external mobile access
echo [3/3] Starting Cloudflare Tunnel for external access...
echo ---------------------------------------------------------------------
echo   NOTE: The tunnel URL below changes on each restart.
echo   For a FIXED URL, use WiFi: http://192.168.55.204:3000
echo ---------------------------------------------------------------------
echo.

npx cloudflared tunnel --url http://localhost:3000

pause
