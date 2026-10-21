@echo off
setlocal enabledelayedexpansion
title Push /bounded Discord Bot to GitHub
cls
echo ========================================================
echo        PUSH /BOUNDED DISCORD BOT TO GITHUB
echo ========================================================
echo.

git status --short
echo.

set "DEFAULT_REMOTE=https://github.com/xron44507-star/bounded"
echo Target Repository: %DEFAULT_REMOTE%
set "INPUT_REPO="
set /p "INPUT_REPO=Press ENTER to push to this repo, or paste a different URL: "

if "%INPUT_REPO%"=="" (
    set "REPO=%DEFAULT_REMOTE%"
) else (
    set "REPO=%INPUT_REPO%"
)

echo.
echo [*] Selected repository: %REPO%
echo.

set "MSG=Update /bounded Discord Bot"
set "INPUT_MSG="
set /p "INPUT_MSG=Enter commit message (Press ENTER for default: 'Update /bounded Discord Bot'): "
if not "%INPUT_MSG%"=="" set "MSG=%INPUT_MSG%"

echo.
echo [*] Staging all files...
git add .

echo [*] Creating commit: "%MSG%"...
git commit -m "%MSG%" 2>nul

echo [*] Setting up main branch and remote origin...
git branch -M main
git remote remove origin 2>nul
git remote add origin %REPO%

echo.
echo [*] Pushing bot code to GitHub...
git push -u origin main --force

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo [SUCCESS] /bounded Discord Bot pushed to GitHub successfully!
    echo View your repository: %REPO%
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo [ERROR] Git push encountered an issue.
    echo Make sure you are signed into your GitHub account:
    echo https://github.com/xron44507-star
    echo ========================================================
)

echo.
pause
