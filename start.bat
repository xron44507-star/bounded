@echo off
title /bounded Discord Bot (Prefix: .)
:main
echo ===================================================
echo     /BOUNDED DISCORD BOT (PREFIX: .)
echo ===================================================
echo.
echo Starting bot...
node index.js
echo.
echo [BOT STOPPED] Restarting in 5 seconds... (Press Ctrl+C to cancel)
timeout /t 5 /nobreak >nul
goto main
