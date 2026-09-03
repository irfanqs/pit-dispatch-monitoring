@echo off
setlocal

rem Run both services from this project's directory.
set "PROJECT_DIR=%~dp0"

start "Pit Dispatch Monitoring" cmd /k "cd /d ""%PROJECT_DIR%"" && python app.py"
timeout /t 2 /nobreak >nul
start "Cloudflare Tunnel" cmd /k "cd /d ""%PROJECT_DIR%"" && cloudflared tunnel --url http://localhost:5010"

endlocal
