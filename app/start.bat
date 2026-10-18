@echo off
cd /d "%~dp0"
echo Starting OSIEN Control Center...
start /B node server.js
timeout /t 2 /nobreak >nul
start http://localhost:4096
echo App running at http://localhost:4096
echo Press any key to stop...
pause >nul
taskkill /F /IM node.exe >nul 2>&1
