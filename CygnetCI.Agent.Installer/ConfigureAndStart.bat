@echo off
REM ConfigureAndStart.bat - Configure CygnetCI Agent and start service
REM Run this script as Administrator after installation
REM
REM Usage: ConfigureAndStart.bat "C:\Program Files\CygnetCI Agent\" "http://api-server:8000" "agent-uuid" "agent-name"
REM   - InstallPath: Path where agent is installed (include trailing backslash)
REM   - ApiUrl: URL of the CygnetCI API server
REM   - AgentUuid: UUID from CygnetCI web UI
REM   - AgentName: (Optional) Display name for this agent

setlocal enabledelayedexpansion

set INSTALL_PATH=%~1
set API_URL=%~2
set AGENT_UUID=%~3
set AGENT_NAME=%~4

REM Default install path if not provided
if "%INSTALL_PATH%"=="" set INSTALL_PATH=C:\Program Files\CygnetCI Agent\

REM Validate required parameters
if "%API_URL%"=="" (
    echo ERROR: API URL is required
    echo Usage: ConfigureAndStart.bat "InstallPath" "ApiUrl" "AgentUuid" "AgentName"
    exit /b 1
)

if "%AGENT_UUID%"=="" (
    echo ERROR: Agent UUID is required
    echo Usage: ConfigureAndStart.bat "InstallPath" "ApiUrl" "AgentUuid" "AgentName"
    exit /b 1
)

echo ============================================
echo CygnetCI Agent Configuration
echo ============================================
echo Install Path: %INSTALL_PATH%
echo API URL: %API_URL%
echo Agent UUID: %AGENT_UUID%
echo Agent Name: %AGENT_NAME%
echo ============================================

REM Check if running as administrator
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: This script must be run as Administrator
    exit /b 1
)

REM Run PowerShell configuration script
echo.
echo Configuring appsettings.json...
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%INSTALL_PATH%Configure-Agent.ps1" -InstallPath "%INSTALL_PATH%" -ApiUrl "%API_URL%" -AgentUuid "%AGENT_UUID%" -AgentName "%AGENT_NAME%"

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Configuration failed with error code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

echo Configuration completed successfully.

REM Set service to auto-start
echo.
echo Setting service to auto-start...
sc config CygnetCI.Agent start= auto
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Could not set service to auto-start
)

REM Start the service
echo.
echo Starting CygnetCI Agent service...
net start CygnetCI.Agent

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo SUCCESS: CygnetCI Agent is now running!
    echo ============================================
) else (
    echo.
    echo WARNING: Service did not start. Error code: %ERRORLEVEL%
    echo Please check the logs at: %INSTALL_PATH%logs\
    echo You can start the service manually with: net start CygnetCI.Agent
)

exit /b 0
