@echo off
setlocal
cd /d "%~dp0"
title UNO Party - Installation corrigee
chcp 65001 >nul

echo ================================================
echo        UNO PARTY - INSTALLATION CORRIGEE
echo ================================================
echo.
echo Ce programme adapte UNO a ton portail existant.
echo Il ne supprime aucun autre jeu.
echo.
if not exist "server.js" (
  echo ERREUR: Ce fichier doit etre place dans mon-portail-jeux,
  echo au meme niveau que server.js.
  goto echec
)
if not exist "scripts\installer-uno.js" (
  echo ERREUR: le fichier scripts\installer-uno.js est introuvable.
  echo Extrais tout le contenu de l'archive dans mon-portail-jeux.
  goto echec
)
where node >nul 2>nul
if errorlevel 1 (
  echo ERREUR: Node.js est introuvable sur cet ordinateur.
  goto echec
)

echo [1/3] Raccordement UNO a ton portail...
node "scripts\installer-uno.js"
if errorlevel 1 goto echec

echo.
echo [2/3] Installation des dependances necessaires...
call npm install
if errorlevel 1 goto echec

echo.
echo [3/3] Verification du code et des tests UNO...
node --check server.js
if errorlevel 1 goto echec
node --test "tests\uno-rules.test.js" "tests\uno-media.test.js" "tests\uno-network.test.js" "tests\uno-integration.test.js"
if errorlevel 1 goto echec

echo.
echo ================================================
echo         INSTALLATION LOCALE TERMINEE !
echo ================================================
echo Ouvre GitHub Desktop pour envoyer les modifications.
echo Le site Render n'est pas encore mis a jour.
echo.
pause
exit /b 0

:echec
echo.
echo L'installation n'est pas terminee.
echo Prends une photo de cette fenetre et envoie-la dans ChatGPT.
echo.
pause
exit /b 1
