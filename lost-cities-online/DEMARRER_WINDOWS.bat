@echo off
cd /d "%~dp0"
echo Demarrage de Lost Cities Duel sur le reseau local...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable. Installe Node.js LTS depuis https://nodejs.org/
  pause
  exit /b 1
)
node server.js
pause
