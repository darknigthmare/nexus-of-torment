@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js non detecte : lancement direct dans le navigateur.
  start "Nexus of Torment" "%~dp0index.html"
  exit /b 0
)
node server.mjs
if errorlevel 1 pause
