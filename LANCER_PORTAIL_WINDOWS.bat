@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Installe Node.js version 20 ou plus depuis https://nodejs.org/
  pause
  exit /b 1
)
echo.
echo =================================================
echo        MY GAME ARCADE - TEST LOCAL DU PORTAIL
echo =================================================
echo.
echo Adresse du portail: http://localhost:3000/
echo Ton jeu: http://localhost:3000/games/marvel-fusion/
echo Pour arreter le serveur, ferme cette fenetre.
echo.
node server.js
pause
