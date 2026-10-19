@echo off
title Mod, Music & Gambling Discord Bot (Prefix: ,)
:main
echo ===================================================
echo     DISCORD MODERATION, MUSIC & GAMBLING (PREFIX: ,)
echo ===================================================
echo.
echo Starting bot...
node index.js
echo.
echo [BOT STOPPED] Restarting in 5 seconds... (Press Ctrl+C to cancel)
timeout /t 5 /nobreak >nul
goto main
