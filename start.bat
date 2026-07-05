@echo off
chcp 65001 >nul
title Real Estate System
cd /d "%~dp0"
echo ============================================
echo    Real Estate System  -  starting...
echo    Opening http://localhost:5599
echo ============================================
start "" http://localhost:5599
python server.py
pause
