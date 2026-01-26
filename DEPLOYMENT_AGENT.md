# CygnetCI Agent Deployment Guide (.NET Windows Service)

This guide covers building the CygnetCI Agent locally and deploying as a Windows Service on Windows Server.

---

## Overview

The CygnetCI Agent can be deployed in two ways:

1. **MSI Installer (Recommended)** - Double-click installation with GUI wizard
2. **PowerShell Scripts** - Command-line installation for automation

Both methods:
- Install as a Windows Service with auto-start
- Create necessary directories (logs, work, downloads)
- Configure automatic restart on failure
- Self-contained (no .NET runtime needed on server)

---

## Prerequisites

### On Development Machine (Build Machine)
- .NET 9.0 SDK
- PowerShell 5.0+

### On Windows Server (Production)
- Windows Server 2019/2022 or Windows 10/11
- Administrator access
- Network connectivity to CygnetCI API server
- No .NET installation required (self-contained)

---

## Option A: MSI Installer (Recommended)

### Step A.1: Build MSI on Development Machine

```powershell
cd "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Agent.Installer"

# Build the MSI
.\build_msi.ps1
```

This creates:
- `bin\Release\CygnetCI.Agent.Setup.msi` - MSI installer (~47 MB)

### Step A.2: Copy MSI to Server

```powershell
# Copy MSI to server
Copy-Item -Path "bin\Release\CygnetCI.Agent.Setup.msi" `
    -Destination "\\SERVER-NAME\C$\Temp\" -Force
```

### Step A.3: Install on Server

**GUI Installation (Double-click):**
1. Double-click `CygnetCI.Agent.Setup.msi`
2. Follow the installation wizard
3. Accept license agreement
4. Choose installation folder (default: `C:\Program Files\CygnetCI Agent`)
5. Click Install

**Command Line Installation:**
```powershell
# Install with basic UI
msiexec /i "C:\Temp\CygnetCI.Agent.Setup.msi" /qb

# Install silently
msiexec /i "C:\Temp\CygnetCI.Agent.Setup.msi" /qn

# Install to custom location
msiexec /i "C:\Temp\CygnetCI.Agent.Setup.msi" INSTALLFOLDER="D:\CygnetCI Agent" /qb
```

### Step A.4: Configure Agent

After installation, edit the configuration file:

```powershell
notepad "C:\Program Files\CygnetCI Agent\appsettings.json"
```

Update these settings:
```json
{
  "Agent": {
    "ServerUrl": "http://YOUR_API_SERVER:8000",
    "AgentName": "YOUR_SERVER_NAME",
    "Location": "Your Server Location"
  }
}
```

Restart the service to apply changes:
```powershell
Restart-Service CygnetCI.Agent
```

### Step A.5: Verify Installation

```powershell
# Check service status
Get-Service CygnetCI.Agent

# Service should show: Status = Running
```

### Step A.6: Uninstall

**From Windows Settings:**
1. Go to Settings > Apps > Installed Apps
2. Search for "CygnetCI Agent"
3. Click Uninstall

**From Command Line:**
```powershell
msiexec /x "C:\Temp\CygnetCI.Agent.Setup.msi" /qb
```

---

## Option B: PowerShell Scripts

### Step B.1: Build on Development Machine

```powershell
cd "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Agent"

# Build with ZIP for easy transfer
.\build_installer.ps1 -CreateZip

# Or build without ZIP
.\build_installer.ps1
```

This creates:
- `dist\installer\` - Folder containing all files
- `CygnetCI-Agent-Installer.zip` - ZIP archive

### Step B.2: Copy to Server

```powershell
# Transfer ZIP and extract on server
Expand-Archive -Path "C:\Temp\CygnetCI-Agent-Installer.zip" `
    -DestinationPath "C:\Temp\CygnetCI-Agent-Installer" -Force
```

### Step B.3: Install on Server

Open PowerShell **as Administrator**:

```powershell
cd C:\Temp\CygnetCI-Agent-Installer

# Install with configuration
.\Install-CygnetCIAgent.ps1 `
    -ServerUrl "http://192.168.1.100:8000" `
    -AgentName "Production-Server-01" `
    -AgentLocation "Data Center - Rack 5"
```

### Step B.4: Uninstall

```powershell
.\Uninstall-CygnetCIAgent.ps1

# Keep configuration for reinstall
.\Uninstall-CygnetCIAgent.ps1 -KeepConfig
```

---

## Configuration Reference

### Configuration File Location

```
C:\Program Files\CygnetCI Agent\appsettings.json
```

### Full Configuration Options

```json
{
  "Agent": {
    "ServerUrl": "http://your-api-server:8000",
    "AgentUuid": "auto-generated-guid",
    "AgentName": "Your-Agent-Name",
    "Location": "Your Location Description",
    "HeartbeatIntervalSeconds": 30,
    "TaskPollingIntervalSeconds": 5,
    "FilePollingIntervalSeconds": 10,
    "ReleasePollingIntervalSeconds": 10,
    "WorkingDirectory": "work",
    "DownloadsDirectory": "downloads",
    "MaxConcurrentTasks": 3,
    "MaxConcurrentReleases": 2,
    "ScriptTimeoutSeconds": 3600,
    "Proxy": {
      "Enabled": false,
      "Address": "",
      "Port": 8080,
      "UseDefaultCredentials": false,
      "Username": "",
      "Password": "",
      "BypassList": [],
      "BypassOnLocal": true
    },
    "WebsitePings": [
      {
        "Name": "CygnetCI API",
        "Url": "http://your-api-server:8000/monitoring/api/ping",
        "TimeoutSeconds": 5,
        "Enabled": true
      }
    ]
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft": "Warning",
      "CygnetCI.Agent": "Information"
    }
  }
}
```

---

## Service Management

### Start/Stop/Restart

```powershell
# Start
Start-Service CygnetCI.Agent

# Stop
Stop-Service CygnetCI.Agent

# Restart
Restart-Service CygnetCI.Agent

# Check status
Get-Service CygnetCI.Agent
```

### View Service Details

```powershell
sc.exe qc CygnetCI.Agent
```

---

## Troubleshooting

### Agent Won't Start

```powershell
# Run manually to see errors
cd "C:\Program Files\CygnetCI Agent"
.\CygnetCI.Agent.exe

# Check Windows Event Log
Get-EventLog -LogName Application -Source "*CygnetCI*" -Newest 20
```

### Agent Not Appearing in Dashboard

1. Verify API URL in `appsettings.json`
2. Test API connectivity:
```powershell
Invoke-WebRequest -Uri "http://your-api-server:8000/health" -UseBasicParsing
```
3. Check firewall allows outbound connections

### Agent Shows Offline

The agent is marked offline if no heartbeat received for 2 minutes.

1. Check service is running: `Get-Service CygnetCI.Agent`
2. Check network connectivity to API
3. Verify `HeartbeatIntervalSeconds` is reasonable (30-60 seconds)

### Permission Errors

```powershell
$path = "C:\Program Files\CygnetCI Agent"
icacls $path /grant "SYSTEM:(OI)(CI)F" /T
icacls $path /grant "Administrators:(OI)(CI)F" /T
```

---

## Proxy Configuration

If the agent needs to connect through a proxy:

```json
{
  "Agent": {
    "Proxy": {
      "Enabled": true,
      "Address": "http://proxy.company.com",
      "Port": 8080,
      "UseDefaultCredentials": true,
      "BypassList": ["localhost", "127.0.0.1", "*.company.internal"],
      "BypassOnLocal": true
    }
  }
}
```

---

## Website Monitoring

Configure websites to monitor:

```json
{
  "Agent": {
    "WebsitePings": [
      {
        "Name": "Production Website",
        "Url": "https://www.example.com",
        "TimeoutSeconds": 10,
        "Enabled": true
      },
      {
        "Name": "Internal API",
        "Url": "http://internal-api:8080/health",
        "TimeoutSeconds": 5,
        "Enabled": true
      }
    ]
  }
}
```

---

## Quick Reference

### Build Commands

| Method | Command | Output |
|--------|---------|--------|
| MSI | `.\build_msi.ps1` | `bin\Release\CygnetCI.Agent.Setup.msi` |
| Scripts | `.\build_installer.ps1` | `dist\installer\` folder |
| Scripts + ZIP | `.\build_installer.ps1 -CreateZip` | `CygnetCI-Agent-Installer.zip` |

### Installation Commands

| Method | Command |
|--------|---------|
| MSI GUI | Double-click `.msi` file |
| MSI Silent | `msiexec /i "path.msi" /qn` |
| PowerShell | `.\Install-CygnetCIAgent.ps1 -ServerUrl "url"` |

### File Locations

| Path | Description |
|------|-------------|
| `C:\Program Files\CygnetCI Agent\` | Installation directory |
| `C:\Program Files\CygnetCI Agent\appsettings.json` | Configuration |
| `C:\Program Files\CygnetCI Agent\logs\` | Log files |
| `C:\Program Files\CygnetCI Agent\work\` | Working directory |
| `C:\Program Files\CygnetCI Agent\downloads\` | Downloaded files |

---

## Summary

### MSI Installation (Recommended)

1. **Build MSI**: Run `.\build_msi.ps1` in the Installer folder
2. **Copy to server**: Transfer the MSI file
3. **Install**: Double-click MSI or run `msiexec /i "path.msi"`
4. **Configure**: Edit `appsettings.json` with API URL
5. **Restart service**: `Restart-Service CygnetCI.Agent`
6. **Verify**: Check CygnetCI dashboard for the agent

### PowerShell Installation

1. **Build**: Run `.\build_installer.ps1 -CreateZip`
2. **Copy to server**: Transfer ZIP file
3. **Extract**: `Expand-Archive` the ZIP
4. **Install**: Run `.\Install-CygnetCIAgent.ps1 -ServerUrl "http://api:8000"`
5. **Verify**: Check service status and dashboard
