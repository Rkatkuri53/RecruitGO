@echo off
chcp 65001 >nul
title LinkedIn Recruiter Agent - Standalone System Installer
echo ==========================================================
echo STARTING CUSTOM STANDALONE SYSTEM APP INSTALLER
echo ==========================================================
echo.

:: Step 1: Environment Check
echo [STEP 1/5] Checking environment prerequisites...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed. Please install Node.js version 18 or higher and try again.
    pause
    exit /b 1
)
echo  - Node.js detected.
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: npm is not installed.
    pause
    exit /b 1
)
echo  - npm detected.

:: Step 2: Ollama Check
echo [STEP 2/5] Validating local Ollama environment...
curl -s http://localhost:11434/api/tags >nul 2>nul
if %errorlevel% neq 0 (
    echo WARNING: Local Ollama is not running at http://localhost:11434.
    echo Please start Ollama before proceeding.
    echo.
    echo Continuing installer anyway. Note: Local AI features will remain offline until Ollama is launched.
) else (
    echo  - Local Ollama detected online!
)

:: Ensure models are pulled
echo.
echo Checking required local LLM models...
echo [MODEL] Pulling llama3 model...
ollama pull llama3
echo [MODEL] Pulling phi3 model...
ollama pull phi3
echo  - Local models verified.

:: Step 3: Install dependencies
echo.
echo [STEP 3/5] Installing local package dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm package installation failed.
    pause
    exit /b 1
)

:: Step 4: Compiling Application
echo.
echo [STEP 4/5] Compiling application source code...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Compilation failed.
    pause
    exit /b 1
)
echo  - Compilation successful.

:: Step 5: Deploys System Shortcuts
echo.
echo [STEP 5/5] Registering Application Shortcuts in Windows System...
call powershell -ExecutionPolicy Bypass -File "%~dp0scripts\create_shortcuts.ps1"
if %errorlevel% neq 0 (
    echo WARNING: Failed to register application shortcuts.
)

echo.
echo ==========================================================
echo SUCCESS! Standalone Recruiter Agent successfully installed!
echo.
echo Launch items created:
echo 1. Desktop Shortcut: "LinkedIn Command Center"
echo 2. Start Menu: Programs - LinkedIn Command Center
echo.
echo Enforced completely local Ollama execution logic.
echo ==========================================================
pause
