@echo off
chcp 65001 >nul
title Preview Link - keep this window OPEN while sharing
cd /d "%~dp0"

echo ============================================================
echo   CUSTOMER PREVIEW LINK
echo ============================================================

if not exist "tools\cloudflared.exe" (
  echo   [!] tools\cloudflared.exe is missing.
  echo   Download it once from:
  echo   https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  echo   Save it as:  %~dp0tools\cloudflared.exe   then run this again.
  echo.
  pause
  exit /b
)

echo   Starting the demo server...
start /b python -m http.server 5600 --directory preview >nul 2>&1
timeout /t 2 >nul

echo   Creating your public link (please wait ~10 seconds)...
echo.
echo   Copy the  https://....trycloudflare.com  address shown below
echo   and send it to your customer.
echo.
echo   Keep THIS window OPEN while they are viewing.
echo   Close this window when you are done to stop sharing.
echo ============================================================
echo.

tools\cloudflared.exe tunnel --url http://localhost:5600 --no-autoupdate

echo.
echo Sharing stopped.
pause
