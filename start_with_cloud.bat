@echo off
echo [*] Starting TeamVConnect Project with Permanent Cloudflare Tunnel...

:: Kill existing node processes
taskkill /F /IM node.exe /T >nul 2>&1

:: 1. Start Signaling Server
echo [+] Launching Signaling Server (Port 3001)...
start "TeamV-Server" cmd /c "node server.js"

:: 2. Start Frontend
echo [+] Launching Frontend (Port 5173)...
cd frontend
start "TeamV-Frontend" cmd /c "npm run dev"

:: 3. Start Cloudflare Tunnel
echo [+] Launching Cloudflare Tunnel (teamv-tunnel)...
cd ..
start "Cloudflare-Tunnel" cmd /c "npx cloudflared tunnel --config cloudflared_config.yml run teamv-tunnel"

echo.
echo ========================================================
echo [DONE] Project is booting up with your Custom Domain !
echo.
echo Application URL : https://v.jree.com.ly
echo Signaling API : https://api-v.jree.com.ly
echo ========================================================
pause
