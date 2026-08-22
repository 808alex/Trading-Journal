@echo off
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies, this only happens once...
  call npm install
)

start "Trenching Journal Server" /min cmd /c "node server\index.js"
timeout /t 2 /nobreak >nul
start http://localhost:3000
