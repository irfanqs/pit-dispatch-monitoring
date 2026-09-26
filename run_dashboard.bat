@echo off
setlocal

for %%I in ("%~dp0.") do set "PROJECT_DIR=%%~fI"
pushd "%PROJECT_DIR%" || goto :directory_failed

echo Updating project from GitHub...
git pull --ff-only
if errorlevel 1 goto :pull_failed

echo Checking AI API key configuration...
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\setup_env.ps1"
if errorlevel 1 goto :env_failed

python -c "import dotenv" >nul 2>&1
if errorlevel 1 (
  echo Installing python-dotenv for the selected Python interpreter...
  python -m pip install python-dotenv
  if errorlevel 1 goto :dependency_failed
)

start "Pit Dispatch Monitoring" cmd /k "cd /d ""%PROJECT_DIR%"" && python app.py"
timeout /t 2 /nobreak >nul
start "Cloudflare Tunnel" cmd /k "cd /d ""%PROJECT_DIR%"" && cloudflared tunnel --url http://localhost:5010"

popd
endlocal
exit /b 0

:directory_failed
echo ERROR: Project directory not found: "%PROJECT_DIR%"
pause
exit /b 1

:pull_failed
echo ERROR: Git pull failed. Resolve local changes or network issues, then run this launcher again.
popd
pause
exit /b 1

:env_failed
echo ERROR: .env setup did not complete. Run this launcher again to retry.
popd
pause
exit /b 1

:dependency_failed
echo ERROR: python-dotenv installation failed. Check Python and pip, then retry.
popd
pause
exit /b 1
