# CygnetCI Deployment Guide for Windows Server

This guide covers deploying all components of CygnetCI on a Windows Server.

## Components Overview

| Component | Technology | Default Port | Purpose |
|-----------|------------|--------------|---------|
| CygnetCI.API | Python FastAPI | 8000 | Backend REST API |
| CygnetCI.Web | Next.js 14 | 3000 | Frontend Web Application |
| CygnetCI.Agent | .NET 9.0 | N/A | Windows Service Agent |
| PostgreSQL | Database | 5432 | Data Storage |

---

## Prerequisites

### 1. Install Required Software

#### A. PostgreSQL Database
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Run the installer and note down:
   - Installation directory
   - Data directory
   - Port (default: 5432)
   - Superuser password
3. Add PostgreSQL bin to PATH: `C:\Program Files\PostgreSQL\16\bin`

#### B. Python 3.11+
1. Download from: https://www.python.org/downloads/
2. During installation, check "Add Python to PATH"
3. Verify: `python --version`

#### C. Node.js 18+ (LTS)
1. Download from: https://nodejs.org/
2. Install with default options
3. Verify: `node --version` and `npm --version`

#### D. .NET 9.0 Runtime & SDK
1. Download from: https://dotnet.microsoft.com/download/dotnet/9.0
2. Install both Runtime and SDK
3. Verify: `dotnet --version`

#### E. Git (Optional but recommended)
1. Download from: https://git-scm.com/download/win

---

## Step 1: Database Setup

### 1.1 Create Database and User

Open PowerShell as Administrator and run:

```powershell
# Connect to PostgreSQL
psql -U postgres

# In psql console, run:
CREATE DATABASE cygnetci;
CREATE USER cygnetci_user WITH ENCRYPTED PASSWORD 'YourSecurePassword123!';
GRANT ALL PRIVILEGES ON DATABASE cygnetci TO cygnetci_user;
\c cygnetci
GRANT ALL ON SCHEMA public TO cygnetci_user;
\q
```

### 1.2 Verify Connection

```powershell
psql -U cygnetci_user -d cygnetci -h localhost
```

---

## Step 2: Deploy CygnetCI.API (FastAPI Backend)

### 2.1 Copy Application Files

```powershell
# Create deployment directory
New-Item -ItemType Directory -Force -Path "C:\CygnetCI\API"

# Copy API files (from your source)
Copy-Item -Path "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.API\*" -Destination "C:\CygnetCI\API" -Recurse
```

### 2.2 Create Virtual Environment

```powershell
cd C:\CygnetCI\API

# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# If requirements.txt doesn't exist, install manually:
pip install fastapi uvicorn sqlalchemy psycopg2-binary pydantic python-multipart aiofiles httpx anthropic cryptography
```

### 2.3 Configure Application

Create/update `C:\CygnetCI\API\config.json`:

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "cygnetci",
    "user": "cygnetci_user",
    "password": "YourSecurePassword123!"
  },
  "server": {
    "host": "0.0.0.0",
    "port": 8000,
    "reload": false
  },
  "cors": {
    "origins": ["http://localhost:3000", "http://your-server-ip:3000", "http://your-domain.com"]
  }
}
```

### 2.4 Initialize Database Tables

```powershell
cd C:\CygnetCI\API
.\venv\Scripts\Activate.ps1

# Run the application once to create tables
python -c "from database import engine; import models; models.Base.metadata.create_all(bind=engine)"
```

### 2.5 Create Windows Service for API

Create `C:\CygnetCI\API\start_api.bat`:

```batch
@echo off
cd /d C:\CygnetCI\API
call venv\Scripts\activate.bat
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Install NSSM (Non-Sucking Service Manager) to run as Windows Service:

```powershell
# Download NSSM from https://nssm.cc/download
# Extract to C:\Tools\nssm

# Install service
C:\Tools\nssm\win64\nssm.exe install CygnetCI-API "C:\CygnetCI\API\start_api.bat"
C:\Tools\nssm\win64\nssm.exe set CygnetCI-API AppDirectory "C:\CygnetCI\API"
C:\Tools\nssm\win64\nssm.exe set CygnetCI-API DisplayName "CygnetCI API Service"
C:\Tools\nssm\win64\nssm.exe set CygnetCI-API Description "CygnetCI FastAPI Backend Service"
C:\Tools\nssm\win64\nssm.exe set CygnetCI-API Start SERVICE_AUTO_START

# Start service
net start CygnetCI-API
```

### 2.6 Verify API is Running

```powershell
# Test API
Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing

# Or open in browser
Start-Process "http://localhost:8000/docs"
```

---

## Step 3: Deploy CygnetCI.Web (Next.js Frontend)

### 3.1 Copy Application Files

```powershell
# Create deployment directory
New-Item -ItemType Directory -Force -Path "C:\CygnetCI\Web"

# Copy Web files
Copy-Item -Path "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Web\cygnetci-web\*" -Destination "C:\CygnetCI\Web" -Recurse
```

### 3.2 Configure Environment

Create `C:\CygnetCI\Web\.env.production`:

```env
NEXT_PUBLIC_API_URL=http://your-server-ip:8000
```

Update `C:\CygnetCI\Web\src\lib\api\config.ts` if needed:

```typescript
export const CONFIG = {
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    headers: {
      'Content-Type': 'application/json',
    }
  }
};
```

### 3.3 Build Application

```powershell
cd C:\CygnetCI\Web

# Install dependencies
npm install

# Build production version
npm run build
```

### 3.4 Create Windows Service for Web

Create `C:\CygnetCI\Web\start_web.bat`:

```batch
@echo off
cd /d C:\CygnetCI\Web
set NODE_ENV=production
npm start
```

Install as Windows Service:

```powershell
C:\Tools\nssm\win64\nssm.exe install CygnetCI-Web "C:\CygnetCI\Web\start_web.bat"
C:\Tools\nssm\win64\nssm.exe set CygnetCI-Web AppDirectory "C:\CygnetCI\Web"
C:\Tools\nssm\win64\nssm.exe set CygnetCI-Web DisplayName "CygnetCI Web Service"
C:\Tools\nssm\win64\nssm.exe set CygnetCI-Web Description "CygnetCI Next.js Frontend Service"
C:\Tools\nssm\win64\nssm.exe set CygnetCI-Web Start SERVICE_AUTO_START

# Start service
net start CygnetCI-Web
```

### 3.5 Verify Web is Running

```powershell
Start-Process "http://localhost:3000"
```

---

## Step 4: Deploy CygnetCI.Agent (.NET Windows Service)

### 4.1 Build Agent

```powershell
cd "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Agent"

# Publish as self-contained executable
dotnet publish -c Release -r win-x64 --self-contained true -o "C:\CygnetCI\Agent"
```

### 4.2 Configure Agent

Update `C:\CygnetCI\Agent\appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.Hosting.Lifetime": "Information"
    }
  },
  "AgentConfiguration": {
    "AgentName": "Production-Agent-01",
    "AgentUuid": "prod-agent-001",
    "ServerUrl": "http://localhost:8000",
    "Location": "Windows Server 2022",
    "HeartbeatIntervalSeconds": 30,
    "MetricsCollectionIntervalSeconds": 60,
    "WebsitePings": [
      {
        "Name": "CygnetCI API",
        "Url": "http://localhost:8000/health",
        "TimeoutSeconds": 5,
        "Enabled": true
      },
      {
        "Name": "CygnetCI Web",
        "Url": "http://localhost:3000",
        "TimeoutSeconds": 5,
        "Enabled": true
      }
    ]
  }
}
```

### 4.3 Install as Windows Service

```powershell
# Install the agent as a Windows Service
sc.exe create "CygnetCI-Agent" binPath= "C:\CygnetCI\Agent\CygnetCI.Agent.exe" start= auto DisplayName= "CygnetCI Agent Service"

# Set description
sc.exe description "CygnetCI-Agent" "CygnetCI Monitoring and Deployment Agent"

# Start service
net start CygnetCI-Agent
```

### 4.4 Verify Agent is Running

```powershell
# Check service status
Get-Service CygnetCI-Agent

# Check in CygnetCI Web UI - Agent should appear on Agents page
```

---

## Step 5: Configure Windows Firewall

```powershell
# Open required ports
New-NetFirewallRule -DisplayName "CygnetCI API" -Direction Inbound -Port 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "CygnetCI Web" -Direction Inbound -Port 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "PostgreSQL" -Direction Inbound -Port 5432 -Protocol TCP -Action Allow
```

---

## Step 6: Configure IIS as Reverse Proxy (Optional but Recommended)

### 6.1 Install IIS and Required Modules

```powershell
# Install IIS
Install-WindowsFeature -Name Web-Server -IncludeManagementTools

# Install URL Rewrite Module
# Download from: https://www.iis.net/downloads/microsoft/url-rewrite

# Install Application Request Routing (ARR)
# Download from: https://www.iis.net/downloads/microsoft/application-request-routing
```

### 6.2 Enable Proxy in ARR

1. Open IIS Manager
2. Select server node
3. Double-click "Application Request Routing Cache"
4. Click "Server Proxy Settings" in Actions pane
5. Check "Enable proxy"
6. Click Apply

### 6.3 Create Website for CygnetCI

Create `C:\inetpub\cygnetci\web.config`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system.webServer>
        <rewrite>
            <rules>
                <!-- API Requests -->
                <rule name="API Proxy" stopProcessing="true">
                    <match url="^api/(.*)" />
                    <action type="Rewrite" url="http://localhost:8000/{R:1}" />
                </rule>
                <!-- Web App Requests -->
                <rule name="Web Proxy" stopProcessing="true">
                    <match url="(.*)" />
                    <action type="Rewrite" url="http://localhost:3000/{R:1}" />
                </rule>
            </rules>
        </rewrite>
    </system.webServer>
</configuration>
```

Create IIS Site:

```powershell
Import-Module WebAdministration

# Create site
New-Website -Name "CygnetCI" -Port 80 -PhysicalPath "C:\inetpub\cygnetci" -ApplicationPool "DefaultAppPool"

# For HTTPS (recommended for production)
# First, import your SSL certificate, then:
New-WebBinding -Name "CygnetCI" -Protocol "https" -Port 443 -SslFlags 0
```

---

## Step 7: SSL/HTTPS Configuration (Production)

### 7.1 Using Let's Encrypt (Free)

Install win-acme:

```powershell
# Download from https://www.win-acme.com/
# Extract to C:\Tools\win-acme

# Run to get certificate
C:\Tools\win-acme\wacs.exe
```

### 7.2 Manual Certificate

1. Purchase/obtain SSL certificate
2. Import to Windows Certificate Store
3. Bind to IIS site

---

## Step 8: Automated Deployment Script

Create `C:\CygnetCI\deploy.ps1`:

```powershell
# CygnetCI Deployment Script
param(
    [string]$SourcePath = "D:\Avesh\CygnetCI\SourceCode\CygnetCI",
    [string]$DeployPath = "C:\CygnetCI",
    [switch]$RestartServices
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CygnetCI Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Stop services
if ($RestartServices) {
    Write-Host "`nStopping services..." -ForegroundColor Yellow
    Stop-Service -Name "CygnetCI-API" -ErrorAction SilentlyContinue
    Stop-Service -Name "CygnetCI-Web" -ErrorAction SilentlyContinue
    Stop-Service -Name "CygnetCI-Agent" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
}

# Deploy API
Write-Host "`nDeploying API..." -ForegroundColor Yellow
$apiSource = Join-Path $SourcePath "CygnetCI.API"
$apiDest = Join-Path $DeployPath "API"

# Backup config
$configBackup = $null
$configPath = Join-Path $apiDest "config.json"
if (Test-Path $configPath) {
    $configBackup = Get-Content $configPath -Raw
}

# Copy files (excluding venv)
Get-ChildItem -Path $apiSource -Exclude "venv", "__pycache__", "*.pyc" |
    Copy-Item -Destination $apiDest -Recurse -Force

# Restore config
if ($configBackup) {
    $configBackup | Set-Content $configPath
}

# Deploy Web
Write-Host "`nDeploying Web..." -ForegroundColor Yellow
$webSource = Join-Path $SourcePath "CygnetCI.Web\cygnetci-web"
$webDest = Join-Path $DeployPath "Web"

# Backup .env
$envBackup = $null
$envPath = Join-Path $webDest ".env.production"
if (Test-Path $envPath) {
    $envBackup = Get-Content $envPath -Raw
}

# Copy and rebuild
Copy-Item -Path "$webSource\src" -Destination $webDest -Recurse -Force
Copy-Item -Path "$webSource\public" -Destination $webDest -Recurse -Force
Copy-Item -Path "$webSource\package.json" -Destination $webDest -Force
Copy-Item -Path "$webSource\next.config.ts" -Destination $webDest -Force
Copy-Item -Path "$webSource\tailwind.config.ts" -Destination $webDest -Force
Copy-Item -Path "$webSource\tsconfig.json" -Destination $webDest -Force

# Restore .env
if ($envBackup) {
    $envBackup | Set-Content $envPath
}

# Rebuild
Push-Location $webDest
npm install
npm run build
Pop-Location

# Deploy Agent
Write-Host "`nDeploying Agent..." -ForegroundColor Yellow
$agentSource = Join-Path $SourcePath "CygnetCI.Agent"
$agentDest = Join-Path $DeployPath "Agent"

# Backup appsettings
$settingsBackup = $null
$settingsPath = Join-Path $agentDest "appsettings.json"
if (Test-Path $settingsPath) {
    $settingsBackup = Get-Content $settingsPath -Raw
}

# Publish
Push-Location $agentSource
dotnet publish -c Release -r win-x64 --self-contained true -o $agentDest
Pop-Location

# Restore appsettings
if ($settingsBackup) {
    $settingsBackup | Set-Content $settingsPath
}

# Start services
if ($RestartServices) {
    Write-Host "`nStarting services..." -ForegroundColor Yellow
    Start-Service -Name "CygnetCI-API"
    Start-Service -Name "CygnetCI-Web"
    Start-Service -Name "CygnetCI-Agent"
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Verify services
Write-Host "`nService Status:" -ForegroundColor Cyan
Get-Service -Name "CygnetCI-*" | Format-Table Name, Status, StartType
```

Usage:

```powershell
# Full deployment with service restart
.\deploy.ps1 -RestartServices

# Deploy without restarting services
.\deploy.ps1
```

---

## Step 9: Monitoring and Maintenance

### 9.1 Check Service Status

```powershell
Get-Service -Name "CygnetCI-*" | Format-Table Name, Status, StartType
```

### 9.2 View Logs

```powershell
# API logs (if configured)
Get-Content "C:\CygnetCI\API\logs\api.log" -Tail 100

# Windows Event Logs
Get-EventLog -LogName Application -Source "CygnetCI*" -Newest 50
```

### 9.3 Restart Services

```powershell
Restart-Service -Name "CygnetCI-API"
Restart-Service -Name "CygnetCI-Web"
Restart-Service -Name "CygnetCI-Agent"
```

### 9.4 Database Backup

```powershell
# Create backup script: C:\CygnetCI\backup_db.ps1
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = "C:\CygnetCI\Backups\cygnetci_$timestamp.sql"

# Ensure backup directory exists
New-Item -ItemType Directory -Force -Path "C:\CygnetCI\Backups"

# Backup database
pg_dump -U cygnetci_user -h localhost cygnetci > $backupPath

# Keep only last 7 days of backups
Get-ChildItem "C:\CygnetCI\Backups\*.sql" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
    Remove-Item
```

Schedule with Task Scheduler:

```powershell
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File C:\CygnetCI\backup_db.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
Register-ScheduledTask -TaskName "CygnetCI-DatabaseBackup" -Action $action -Trigger $trigger -Description "Daily CygnetCI database backup"
```

---

## Troubleshooting

### API Not Starting

```powershell
# Check if port is in use
netstat -ano | findstr :8000

# Test database connection
psql -U cygnetci_user -d cygnetci -h localhost -c "SELECT 1"

# Run API manually to see errors
cd C:\CygnetCI\API
.\venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### Web Not Loading

```powershell
# Check if port is in use
netstat -ano | findstr :3000

# Run manually to see errors
cd C:\CygnetCI\Web
npm start
```

### Agent Not Connecting

```powershell
# Check agent logs
Get-Content "C:\CygnetCI\Agent\logs\*.log" -Tail 50

# Test API connectivity from agent
Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing

# Run agent manually
cd C:\CygnetCI\Agent
.\CygnetCI.Agent.exe
```

### Database Connection Issues

```powershell
# Check PostgreSQL service
Get-Service postgresql*

# Check PostgreSQL logs
Get-Content "C:\Program Files\PostgreSQL\16\data\log\*.log" -Tail 100

# Test connection
psql -U postgres -h localhost -c "\l"
```

---

## Quick Reference

| Service | Start Command | Stop Command | Status Command |
|---------|---------------|--------------|----------------|
| API | `net start CygnetCI-API` | `net stop CygnetCI-API` | `sc query CygnetCI-API` |
| Web | `net start CygnetCI-Web` | `net stop CygnetCI-Web` | `sc query CygnetCI-Web` |
| Agent | `net start CygnetCI-Agent` | `net stop CygnetCI-Agent` | `sc query CygnetCI-Agent` |
| PostgreSQL | `net start postgresql-x64-16` | `net stop postgresql-x64-16` | `sc query postgresql-x64-16` |

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Web Application |
| http://localhost:8000 | API Server |
| http://localhost:8000/docs | API Documentation (Swagger) |
| http://localhost:8000/health | API Health Check |

---

## Security Checklist

- [ ] Change default database password
- [ ] Configure firewall rules
- [ ] Enable HTTPS/SSL
- [ ] Set strong passwords for all services
- [ ] Configure proper CORS origins
- [ ] Enable Windows Defender/Antivirus exclusions for CygnetCI folders
- [ ] Set up log rotation
- [ ] Configure automated backups
- [ ] Restrict database access to localhost only (unless needed remotely)
- [ ] Review and secure appsettings.json and config.json files
