@echo off
cd /d "%~dp0"

rem node:sqlite needs Node.js 22.13+. Check up front so an old or missing
rem Node shows a message here instead of a server window that vanishes.
node -e "require('node:sqlite')" >nul 2>&1
if errorlevel 1 (
  echo.
  echo Trenching Journal needs Node.js 22.13 or newer.
  echo Get the current LTS from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, this only happens once...
  call npm install
)

start "Trenching Journal Server" /min cmd /c "node server\index.js"
timeout /t 2 /nobreak >nul
start http://localhost:3000
