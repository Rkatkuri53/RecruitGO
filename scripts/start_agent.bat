@echo off
setlocal enabledelayedexpansion

:: LinkedIn Professional Agent - Startup Wrapper
:: This script adds a random delay to avoid bot detection

echo Starting LinkedIn Agent...
echo Current Time: %TIME%

:: Generate random delay between 0 and 45 minutes (2700 seconds)
set /a delay=%RANDOM% %% 2700
echo Waiting for %delay% seconds before starting (Stealth Mode)...

timeout /t %delay% /nobreak

:: Run the agent
cd /d "c:\Users\rkatk\Documents\Linkedin Poster"
npm start

echo Agent finished execution.
pause
