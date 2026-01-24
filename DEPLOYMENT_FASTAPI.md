# CygnetCI API Deployment Guide (FastAPI on IIS)

This guide covers building the CygnetCI FastAPI backend locally and deploying to Windows IIS.

---

## Overview

This deployment method:
- Builds the FastAPI app with all dependencies locally
- Creates a self-contained package with Python virtual environment
- Deploys to Windows Server IIS using HttpPlatformHandler
- No need to install Python separately on the server (portable Python included)

---

## Prerequisites

### On Development Machine (Build Machine)
- Python 3.11 or later
- pip (Python package manager)
- PowerShell 5.0+

### On Windows Server (Production)
- Windows Server 2019/2022
- IIS with HttpPlatformHandler module
- PostgreSQL database (see DEPLOYMENT_DATABASE.md)

---

## Part 1: Build on Development Machine

### Step 1.1: Navigate to API Directory

```powershell
cd "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Api"
```

### Step 1.2: Run Build Script

```powershell
# Build without ZIP
.\build_for_iis.ps1

# Or build with ZIP for easy transfer
.\build_for_iis.ps1 -CreateZip
```

This creates a `dist` folder containing:
```
dist/
├── venv/                    # Python virtual environment with all dependencies
├── main.py                  # Main FastAPI application
├── models.py                # Database models
├── database.py              # Database connection
├── config.py                # Configuration loader
├── customer_api.py          # Customer API routes
├── claude_service.py        # Claude AI service
├── email_service.py         # Email service
├── config.ini.template      # Configuration template
├── web.config               # IIS configuration
├── start_api.bat            # Manual startup script
├── run_server.py            # Server entry point
├── requirements.txt         # Dependencies list
└── logs/                    # Log directory
```

### Step 1.3: Verify Build

```powershell
# Check the dist folder
Get-ChildItem "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Api\dist"

# Test locally (optional)
cd dist
.\start_api.bat
# Visit http://localhost:8000/docs to verify
# Press Ctrl+C to stop
```

---

## Part 2: Deploy to Windows Server

### Step 2.1: Copy Files to Server

**Option A: Direct Copy**
```powershell
# From development machine
Copy-Item -Path "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Api\dist\*" `
    -Destination "\\SERVER-NAME\C$\CygnetCI\API" `
    -Recurse -Force
```

**Option B: Using ZIP**
```powershell
# On development machine (if you used -CreateZip)
# Transfer CygnetCI-API-Build.zip to server

# On server - extract
Expand-Archive -Path "C:\Temp\CygnetCI-API-Build.zip" `
    -DestinationPath "C:\CygnetCI\API" -Force
```

**Option C: Using Robocopy**
```powershell
robocopy "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Api\dist" `
    "\\SERVER-NAME\C$\CygnetCI\API" /MIR /Z /W:5 /R:3
```

### Step 2.2: Create Directory Structure on Server

```powershell
# On Windows Server
New-Item -ItemType Directory -Force -Path "C:\CygnetCI\API"
New-Item -ItemType Directory -Force -Path "C:\CygnetCI\API\logs"
New-Item -ItemType Directory -Force -Path "C:\CygnetCI\Shared"
New-Item -ItemType Directory -Force -Path "C:\CygnetCI\Shared\scripts"
New-Item -ItemType Directory -Force -Path "C:\CygnetCI\Shared\artifacts"
New-Item -ItemType Directory -Force -Path "C:\CygnetCI\Shared\rollback"
```

---

## Part 3: Configure Application

### Step 3.1: Create Configuration File

```powershell
# Copy template to actual config
Copy-Item "C:\CygnetCI\API\config.ini.template" "C:\CygnetCI\API\config.ini"

# Edit configuration
notepad "C:\CygnetCI\API\config.ini"
```

### Step 3.2: Update config.ini

```ini
# CygnetCI Configuration File

[database]
# PostgreSQL Database Configuration
host = localhost
port = 5432
database = CygnetCI
username = cygnetci_user
password = YourSecurePassword123!

[paths]
# File Storage Paths
nfs_shared_root = C:\CygnetCI\Shared
scripts_folder = scripts
artifacts_folder = artifacts
rollback_scripts_folder = rollback

[server]
# FastAPI Server Configuration
host = 127.0.0.1
port = 8000
reload = false
debug = false

[cors]
# CORS Configuration - Add your web server URLs
allowed_origins = http://localhost,http://your-web-server,https://your-domain.com
allow_credentials = true

[file_transfer]
# File Transfer Settings
max_file_size_mb = 500
allowed_script_extensions = .sh,.ps1,.py,.bat,.cmd
allowed_artifact_extensions = .zip,.tar,.gz,.jar,.war,.exe,.msi
calculate_checksum = true

[claude_ai]
# Claude AI API Configuration (optional)
api_url = https://api.anthropic.com/v1/messages
api_key = YOUR_API_KEY_HERE
model = claude-3-5-sonnet-20241022
max_tokens = 4096
temperature = 0
```

### Step 3.3: Test Application Manually

```powershell
cd C:\CygnetCI\API

# Run using batch file
.\start_api.bat

# Or run directly
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Visit `http://localhost:8000/docs` to verify API is working.

---

## Part 4: Configure IIS

### Step 4.1: Install IIS and HttpPlatformHandler

```powershell
# Install IIS
Install-WindowsFeature -Name Web-Server -IncludeManagementTools

# Download and install HttpPlatformHandler
# From: https://www.iis.net/downloads/microsoft/httpplatformhandler
# Run the installer
```

### Step 4.2: Create web.config for IIS

Create/verify `C:\CygnetCI\API\web.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
    <system.webServer>
        <handlers>
            <add name="PythonHandler" path="*" verb="*" modules="httpPlatformHandler" resourceType="Unspecified"/>
        </handlers>
        <httpPlatform processPath="C:\CygnetCI\API\venv\Scripts\python.exe"
                      arguments="-m uvicorn main:app --host 127.0.0.1 --port %HTTP_PLATFORM_PORT%"
                      stdoutLogEnabled="true"
                      stdoutLogFile="C:\CygnetCI\API\logs\python-stdout"
                      startupTimeLimit="120"
                      processesPerApplication="1"
                      requestTimeout="00:05:00">
            <environmentVariables>
                <environmentVariable name="PYTHONPATH" value="C:\CygnetCI\API"/>
            </environmentVariables>
        </httpPlatform>
    </system.webServer>
</configuration>
```

### Step 4.3: Set Permissions

```powershell
# Grant IIS permissions to the API folder
icacls "C:\CygnetCI\API" /grant "IIS_IUSRS:(OI)(CI)F" /T
icacls "C:\CygnetCI\API" /grant "IUSR:(OI)(CI)F" /T
icacls "C:\CygnetCI\API" /grant "IIS APPPOOL\CygnetCI-API:(OI)(CI)F" /T

# Grant permissions to shared folder
icacls "C:\CygnetCI\Shared" /grant "IIS_IUSRS:(OI)(CI)F" /T
icacls "C:\CygnetCI\Shared" /grant "IIS APPPOOL\CygnetCI-API:(OI)(CI)F" /T
```

### Step 4.4: Create IIS Website

**Using PowerShell:**

```powershell
Import-Module WebAdministration

# Create application pool
New-WebAppPool -Name "CygnetCI-API"
Set-ItemProperty -Path "IIS:\AppPools\CygnetCI-API" -Name "managedRuntimeVersion" -Value ""
Set-ItemProperty -Path "IIS:\AppPools\CygnetCI-API" -Name "startMode" -Value "AlwaysRunning"
Set-ItemProperty -Path "IIS:\AppPools\CygnetCI-API" -Name "processModel.idleTimeout" -Value "00:00:00"

# Create website
New-Website -Name "CygnetCI-API" `
    -Port 8000 `
    -PhysicalPath "C:\CygnetCI\API" `
    -ApplicationPool "CygnetCI-API"

# Start the website
Start-Website -Name "CygnetCI-API"
```

**Using IIS Manager (GUI):**

1. Open IIS Manager (`inetmgr`)
2. Right-click "Application Pools" → "Add Application Pool"
   - Name: `CygnetCI-API`
   - .NET CLR version: `No Managed Code`
   - Managed pipeline mode: `Integrated`
3. Right-click the new pool → "Advanced Settings"
   - Start Mode: `AlwaysRunning`
   - Idle Time-out: `0`
4. Right-click "Sites" → "Add Website"
   - Site name: `CygnetCI-API`
   - Physical path: `C:\CygnetCI\API`
   - Port: `8000`
   - Application pool: `CygnetCI-API`
5. Click OK

### Step 4.5: Verify IIS is Running

```powershell
# Check website status
Get-Website -Name "CygnetCI-API"

# Test API
Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing

# Open API docs
Start-Process "http://localhost:8000/docs"
```

---

## Part 5: Configure Windows Firewall

```powershell
# Allow inbound on port 8000
New-NetFirewallRule -DisplayName "CygnetCI API (Port 8000)" `
    -Direction Inbound `
    -Port 8000 `
    -Protocol TCP `
    -Action Allow
```

---

## Part 6: Alternative - Run as Windows Service (Without IIS)

If you prefer to run without IIS, use NSSM:

### Step 6.1: Download NSSM

Download from https://nssm.cc/download and extract to `C:\Tools\nssm`

### Step 6.2: Install Service

```powershell
# Install service
C:\Tools\nssm\nssm.exe install CygnetCI-API "C:\CygnetCI\API\venv\Scripts\python.exe" "-m uvicorn main:app --host 0.0.0.0 --port 8000"

# Configure service
C:\Tools\nssm\nssm.exe set CygnetCI-API AppDirectory "C:\CygnetCI\API"
C:\Tools\nssm\nssm.exe set CygnetCI-API DisplayName "CygnetCI API Service"
C:\Tools\nssm\nssm.exe set CygnetCI-API Description "CygnetCI FastAPI Backend"
C:\Tools\nssm\nssm.exe set CygnetCI-API Start SERVICE_AUTO_START

# Configure logging
C:\Tools\nssm\nssm.exe set CygnetCI-API AppStdout "C:\CygnetCI\API\logs\stdout.log"
C:\Tools\nssm\nssm.exe set CygnetCI-API AppStderr "C:\CygnetCI\API\logs\stderr.log"
C:\Tools\nssm\nssm.exe set CygnetCI-API AppRotateFiles 1

# Start service
net start CygnetCI-API
```

---

## Updating the Application

### Update Script

Create `C:\CygnetCI\update_api.ps1`:

```powershell
# CygnetCI API Update Script
param(
    [Parameter(Mandatory=$true)]
    [string]$SourcePath  # Path to new dist folder or ZIP
)

Write-Host "Updating CygnetCI API..." -ForegroundColor Cyan

$ApiPath = "C:\CygnetCI\API"

# Backup config
$configBackup = Get-Content "$ApiPath\config.ini" -Raw

# Stop IIS site
Write-Host "Stopping IIS site..." -ForegroundColor Yellow
Stop-Website -Name "CygnetCI-API" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# If source is ZIP, extract it
if ($SourcePath -like "*.zip") {
    Write-Host "Extracting ZIP..." -ForegroundColor Yellow
    Expand-Archive -Path $SourcePath -DestinationPath $ApiPath -Force
} else {
    # Copy files
    Write-Host "Copying files..." -ForegroundColor Yellow
    robocopy $SourcePath $ApiPath /MIR /XF "config.ini" /XD "logs"
}

# Restore config
$configBackup | Set-Content "$ApiPath\config.ini"

# Start IIS site
Write-Host "Starting IIS site..." -ForegroundColor Yellow
Start-Website -Name "CygnetCI-API"

# Verify
Start-Sleep -Seconds 5
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing
    Write-Host "Update successful! API is running." -ForegroundColor Green
} catch {
    Write-Host "Warning: API may not be responding" -ForegroundColor Red
}
```

---

## Troubleshooting

### API Won't Start in IIS

1. Check IIS logs:
```powershell
Get-Content "C:\CygnetCI\API\logs\python-stdout*.log" -Tail 50
```

2. Check Windows Event Log:
```powershell
Get-EventLog -LogName Application -Source "IIS*" -Newest 20
```

3. Run manually to see errors:
```powershell
cd C:\CygnetCI\API
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### Database Connection Error

```powershell
# Test PostgreSQL connection
psql -U cygnetci_user -d CygnetCI -h localhost -c "SELECT 1"

# Verify config.ini database settings
Get-Content "C:\CygnetCI\API\config.ini" | Select-String "database|host|port|username"
```

### Permission Errors

```powershell
# Re-apply permissions
icacls "C:\CygnetCI\API" /grant "IIS_IUSRS:(OI)(CI)F" /T
icacls "C:\CygnetCI\API" /grant "IIS APPPOOL\CygnetCI-API:(OI)(CI)F" /T

# Check app pool identity
Get-ItemProperty "IIS:\AppPools\CygnetCI-API" -Name processModel.identityType
```

### HttpPlatformHandler Not Working

1. Verify HttpPlatformHandler is installed:
```powershell
Get-WebGlobalModule | Where-Object { $_.Name -like "*httpPlatform*" }
```

2. If not installed, download from:
   https://www.iis.net/downloads/microsoft/httpplatformhandler

3. Verify web.config paths are correct:
```powershell
Get-Content "C:\CygnetCI\API\web.config"
```

### Check IIS Logs

```powershell
# IIS logs location
Get-Content "C:\inetpub\logs\LogFiles\W3SVC*\*.log" -Tail 50

# Application logs
Get-Content "C:\CygnetCI\API\logs\*.log" -Tail 50
```

---

## Quick Reference

### Build Commands (Development Machine)

| Command | Description |
|---------|-------------|
| `.\build_for_iis.ps1` | Build without ZIP |
| `.\build_for_iis.ps1 -CreateZip` | Build with ZIP |

### Server Paths

| Path | Description |
|------|-------------|
| `C:\CygnetCI\API\` | API application root |
| `C:\CygnetCI\API\config.ini` | Configuration file |
| `C:\CygnetCI\API\venv\` | Python virtual environment |
| `C:\CygnetCI\API\logs\` | Application logs |
| `C:\CygnetCI\Shared\` | Shared files (scripts, artifacts) |

### IIS Commands

| Command | Description |
|---------|-------------|
| `Start-Website -Name "CygnetCI-API"` | Start website |
| `Stop-Website -Name "CygnetCI-API"` | Stop website |
| `Restart-WebAppPool -Name "CygnetCI-API"` | Restart app pool |
| `Get-Website -Name "CygnetCI-API"` | Check status |

### API Endpoints

| URL | Description |
|-----|-------------|
| `http://localhost:8000/` | API root |
| `http://localhost:8000/docs` | Swagger UI |
| `http://localhost:8000/redoc` | ReDoc |
| `http://localhost:8000/health` | Health check |
| `http://localhost:8000/data` | Dashboard data |

---

## Summary

1. **Build locally**: Run `.\build_for_iis.ps1 -CreateZip`
2. **Copy to server**: Transfer `dist` folder or ZIP to `C:\CygnetCI\API`
3. **Configure**: Create `config.ini` from template
4. **Install IIS**: With HttpPlatformHandler module
5. **Create website**: Point to `C:\CygnetCI\API` on port 8000
6. **Set permissions**: Grant IIS_IUSRS access
7. **Verify**: Visit `http://localhost:8000/docs`
