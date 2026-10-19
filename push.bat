@echo off
title Push Sori Discord Bot to GitHub
cls
echo ========================================================
echo        PUSH SORI DISCORD BOT TO GITHUB
echo ========================================================
echo.

git status --short
echo.

set /p REPO="Enter your GitHub Repository URL (e.g. https://github.com/YourUser/YourRepo.git): "
if "%REPO%"=="" (
    echo [ERROR] No GitHub URL provided!
    pause
    exit /b 1
)

echo.
set /p MSG="Enter commit message (Press Enter for default: 'Update Sori Discord Bot'): "
if "%MSG%"=="" set MSG=Update Sori Discord Bot

echo.
echo [*] Adding files to git...
git add .
echo [*] Committing files: "%MSG%"...
git commit -m "%MSG%"

echo [*] Setting up main branch and remote origin...
git branch -M main
git remote remove origin 2>nul
git remote add origin %REPO%

echo [*] Pushing to GitHub...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo [SUCCESS] Sori Discord Bot pushed to GitHub successfully!
    echo ========================================================
) else (
    echo.
    echo [ERROR] Push failed. If the repo has existing commits, try:
    echo git push -u origin main --force
)

echo.
pause
