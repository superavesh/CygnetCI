# CygnetCI Agent Deployment Guide (.NET Worker Service)

This guide covers deploying the CygnetCI Agent (.NET 9.0 Windows Service) on Windows Server or Windows clients.

---

## Prerequisites

- Windows Server 2019/2022 or Windows 10/11
- Administrator access
- .NET 9.0 Runtime (or SDK for building from source)
- CygnetCI API running and accessible (see DEPLOYMENT_FASTAPI.md)
- Network connectivity to the API server

---

## Step 1: Install .NET 9.0 Runtime

### 1.1 Download .NET Runtime

1. Visit: https://dotnet.microsoft.com/download/dotnet/9.0
2. Download **.NET Runtime** (not SDK, unless building from source)
3. Choose "Windows x64" installer

### 1.2 Install .NET Runtime

1. Run the installer as Administrator
2. Complete the installation

### 1.3 Verify Installation

```powershell
# Open new PowerShell window
dotnet --info

# Should show .NET 9.0.x runtime
```

---

## Step 2: Prepare Deployment Directory

### 2.1 Create Directory Structure

```powershell
# Create deployment directory
New-Item -ItemType Directory -Force -Path "C:\CygnetCI\Agent"
New-Item -ItemType Directory -Force -Path "C:\CygnetCI\Agent\logs"
```

---

## Step 3: Deploy the Agent

### Option A: Deploy Pre-built Binaries (Recommended)

If you have pre-built binaries:

```powershell
# Copy pre-built files
Copy-Item -Path "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Agent\bin\Release\net9.0\win-x64\publish\*" `
    -Destination "C:\CygnetCI\Agent" `
    -Recurse
```

### Option B: Build and Deploy from Source

```powershell
# Navigate to source directory
cd "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Agent"

# Publish as self-contained executable
dotnet publish -c Release -r win-x64 --self-contained true -o "C:\CygnetCI\Agent"

# Verify files
Get-ChildItem "C:\CygnetCI\Agent"
```

The output should include:
- `CygnetCI.Agent.exe` - Main executable
- `appsettings.json` - Configuration file
- Various `.dll` files - Dependencies

---

## Step 4: Configure the Agent

### 4.1 Edit Configuration File

Edit `C:\CygnetCI\Agent\appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.Hosting.Lifetime": "Information",
      "System.Net.Http.HttpClient": "Warning"
    },
    "EventLog": {
      "LogLevel": {
        "Default": "Information"
      }
    }
  },
  "AgentConfiguration": {
    "AgentName": "Production-Agent-01",
    "AgentUuid": "prod-agent-001",
    "ServerUrl": "http://localhost:8000",
    "Location": "Windows Server 2022 - Data Center",
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
      },
      {
        "Name": "Google",
        "Url": "https://www.google.com",
        "TimeoutSeconds": 10,
        "Enabled": true
      }
    ]
  }
}
```

### 4.2 Configuration Options Explained

| Setting | Description | Default |
|---------|-------------|---------|
| `AgentName` | Display name shown in CygnetCI dashboard | Required |
| `AgentUuid` | Unique identifier for this agent | Required |
| `ServerUrl` | CygnetCI API server URL | Required |
| `Location` | Description of where agent is running | Optional |
| `HeartbeatIntervalSeconds` | How often to send heartbeat to server | 30 |
| `MetricsCollectionIntervalSeconds` | How often to collect CPU/memory metrics | 60 |
| `WebsitePings` | List of websites to monitor | Optional |

### 4.3 Generate Unique Agent UUID

```powershell
# Generate a unique UUID for this agent
[guid]::NewGuid().ToString()
```

Use this value for `AgentUuid` in the configuration.

### 4.4 Multiple Agents Configuration

If deploying multiple agents, each must have unique:
- `AgentName` - Descriptive name (e.g., "Web-Server-01", "DB-Server-01")
- `AgentUuid` - Unique identifier

Example for different servers:

**Web Server Agent:**
```json
"AgentConfiguration": {
  "AgentName": "Web-Server-01",
  "AgentUuid": "web-srv-001-abc123",
  "Location": "Web Server - US East",
  ...
}
```

**Database Server Agent:**
```json
"AgentConfiguration": {
  "AgentName": "DB-Server-01",
  "AgentUuid": "db-srv-001-xyz789",
  "Location": "Database Server - US East",
  ...
}
```

---

## Step 5: Test Agent Manually

### 5.1 Run Agent from Command Line

```powershell
cd C:\CygnetCI\Agent

# Run the agent
.\CygnetCI.Agent.exe
```

### 5.2 Verify Agent is Working

1. Check console output for successful heartbeat messages
2. Open CygnetCI Web UI
3. Navigate to Agents page
4. Verify new agent appears with "Online" status

Press `Ctrl+C` to stop the agent.

---

## Step 6: Install as Windows Service

### 6.1 Install Service Using sc.exe

```powershell
# Install the agent as a Windows Service
sc.exe create "CygnetCI-Agent" `
    binPath= "C:\CygnetCI\Agent\CygnetCI.Agent.exe" `
    start= auto `
    DisplayName= "CygnetCI Agent Service"

# Set description
sc.exe description "CygnetCI-Agent" "CygnetCI Monitoring and Deployment Agent - Collects metrics and executes deployment tasks"

# Configure failure recovery (restart on failure)
sc.exe failure "CygnetCI-Agent" reset= 86400 actions= restart/5000/restart/10000/restart/30000
```

### 6.2 Start the Service

```powershell
# Start the service
net start CygnetCI-Agent

# Verify service is running
Get-Service -Name "CygnetCI-Agent"
```

### 6.3 Verify Agent in Dashboard

1. Open CygnetCI Web UI (http://localhost:3000)
2. Go to Agents page
3. Confirm agent shows as "Online"
4. Verify metrics are being collected

---

## Step 7: Configure Windows Firewall

The agent makes outbound connections to the API server. Usually no firewall changes needed.

If the API is on a different server:

```powershell
# Allow outbound connections (usually allowed by default)
# Only needed if outbound is blocked by policy

New-NetFirewallRule -DisplayName "CygnetCI Agent Outbound" `
    -Direction Outbound `
    -Program "C:\CygnetCI\Agent\CygnetCI.Agent.exe" `
    -Action Allow
```

---

## Step 8: Configure Logging

### 8.1 Windows Event Log

The agent logs to Windows Event Log by default. View logs:

```powershell
# View recent agent logs
Get-EventLog -LogName Application -Source "CygnetCI.Agent" -Newest 50

# Or use Event Viewer:
# Applications and Services Logs > Application
```

### 8.2 File Logging (Optional)

To enable file logging, modify `appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information"
    },
    "File": {
      "Path": "C:\\CygnetCI\\Agent\\logs\\agent.log",
      "Append": true,
      "MinLevel": "Information",
      "FileSizeLimitBytes": 10485760,
      "MaxRollingFiles": 5
    }
  }
}
```

Note: File logging requires adding a file logging provider to the agent code.

---

## Service Management

### Start Service

```powershell
net start CygnetCI-Agent
# or
Start-Service -Name "CygnetCI-Agent"
```

### Stop Service

```powershell
net stop CygnetCI-Agent
# or
Stop-Service -Name "CygnetCI-Agent"
```

### Restart Service

```powershell
Restart-Service -Name "CygnetCI-Agent"
```

### Check Status

```powershell
Get-Service -Name "CygnetCI-Agent"
sc.exe query CygnetCI-Agent
```

### View Service Details

```powershell
sc.exe qc CygnetCI-Agent
```

### Uninstall Service

```powershell
# Stop the service first
net stop CygnetCI-Agent

# Remove the service
sc.exe delete CygnetCI-Agent
```

---

## Updating the Agent

### Update Script

Create `C:\CygnetCI\Agent\update_agent.ps1`:

```powershell
# CygnetCI Agent Update Script
param(
    [string]$SourcePath = "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Agent"
)

Write-Host "Updating CygnetCI Agent..." -ForegroundColor Cyan

# Backup current config
$configPath = "C:\CygnetCI\Agent\appsettings.json"
$configBackup = $null
if (Test-Path $configPath) {
    $configBackup = Get-Content $configPath -Raw
    Write-Host "Backed up appsettings.json" -ForegroundColor Gray
}

# Stop service
Write-Host "Stopping service..." -ForegroundColor Yellow
Stop-Service -Name "CygnetCI-Agent" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

# Build and deploy
Write-Host "Building and deploying..." -ForegroundColor Yellow
Push-Location $SourcePath
dotnet publish -c Release -r win-x64 --self-contained true -o "C:\CygnetCI\Agent"
Pop-Location

# Restore config
if ($configBackup) {
    $configBackup | Set-Content $configPath
    Write-Host "Restored appsettings.json" -ForegroundColor Gray
}

# Start service
Write-Host "Starting service..." -ForegroundColor Yellow
Start-Service -Name "CygnetCI-Agent"

# Verify
Start-Sleep -Seconds 5
$service = Get-Service -Name "CygnetCI-Agent"
if ($service.Status -eq "Running") {
    Write-Host "Update completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Warning: Service may not be running correctly" -ForegroundColor Red
}
```

### Manual Update

```powershell
# 1. Stop the service
Stop-Service -Name "CygnetCI-Agent"

# 2. Backup config
Copy-Item "C:\CygnetCI\Agent\appsettings.json" "C:\CygnetCI\Agent\appsettings.json.bak"

# 3. Build and copy new files
cd "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Agent"
dotnet publish -c Release -r win-x64 --self-contained true -o "C:\CygnetCI\Agent"

# 4. Restore config
Copy-Item "C:\CygnetCI\Agent\appsettings.json.bak" "C:\CygnetCI\Agent\appsettings.json"

# 5. Start the service
Start-Service -Name "CygnetCI-Agent"
```

---

## Deploying to Multiple Machines

### Remote Deployment Script

Create `deploy_agent_remote.ps1`:

```powershell
# Deploy CygnetCI Agent to Remote Machine
param(
    [Parameter(Mandatory=$true)]
    [string]$ComputerName,

    [Parameter(Mandatory=$true)]
    [PSCredential]$Credential,

    [string]$AgentName,
    [string]$AgentUuid,
    [string]$ApiServerUrl = "http://api-server:8000"
)

# Generate UUID if not provided
if (-not $AgentUuid) {
    $AgentUuid = [guid]::NewGuid().ToString()
}

# Default agent name to computer name
if (-not $AgentName) {
    $AgentName = $ComputerName
}

Write-Host "Deploying to $ComputerName..." -ForegroundColor Cyan

# Create remote session
$session = New-PSSession -ComputerName $ComputerName -Credential $Credential

# Create directory on remote machine
Invoke-Command -Session $session -ScriptBlock {
    New-Item -ItemType Directory -Force -Path "C:\CygnetCI\Agent"
}

# Copy files to remote machine
Copy-Item -Path "C:\CygnetCI\Agent\*" `
    -Destination "C:\CygnetCI\Agent" `
    -ToSession $session `
    -Recurse

# Configure agent on remote machine
Invoke-Command -Session $session -ScriptBlock {
    param($AgentName, $AgentUuid, $ApiServerUrl)

    $config = Get-Content "C:\CygnetCI\Agent\appsettings.json" | ConvertFrom-Json
    $config.AgentConfiguration.AgentName = $AgentName
    $config.AgentConfiguration.AgentUuid = $AgentUuid
    $config.AgentConfiguration.ServerUrl = $ApiServerUrl
    $config.AgentConfiguration.Location = $env:COMPUTERNAME

    $config | ConvertTo-Json -Depth 10 | Set-Content "C:\CygnetCI\Agent\appsettings.json"

    # Install and start service
    sc.exe create "CygnetCI-Agent" binPath= "C:\CygnetCI\Agent\CygnetCI.Agent.exe" start= auto DisplayName= "CygnetCI Agent Service"
    sc.exe description "CygnetCI-Agent" "CygnetCI Monitoring and Deployment Agent"
    net start CygnetCI-Agent

} -ArgumentList $AgentName, $AgentUuid, $ApiServerUrl

Remove-PSSession $session

Write-Host "Deployment to $ComputerName completed!" -ForegroundColor Green
```

Usage:

```powershell
$cred = Get-Credential
.\deploy_agent_remote.ps1 -ComputerName "SERVER01" -Credential $cred -ApiServerUrl "http://192.168.1.100:8000"
```

---

## Troubleshooting

### Agent Won't Start

```powershell
# Run manually to see errors
cd C:\CygnetCI\Agent
.\CygnetCI.Agent.exe

# Check Windows Event Log
Get-EventLog -LogName Application -Source "*CygnetCI*" -Newest 20

# Check if .NET runtime is installed
dotnet --info
```

### Agent Not Appearing in Dashboard

1. Verify API URL in `appsettings.json` is correct
2. Test API connectivity:

```powershell
# Test API is reachable
Invoke-WebRequest -Uri "http://your-api-server:8000/health" -UseBasicParsing
```

3. Check agent console output for errors
4. Verify `AgentUuid` is unique

### Agent Shows Offline

The agent is marked offline if no heartbeat received for 2 minutes.

1. Check service is running: `Get-Service CygnetCI-Agent`
2. Check network connectivity to API server
3. Verify no firewall blocking outbound connections
4. Check `HeartbeatIntervalSeconds` isn't too high

### High CPU/Memory Usage

1. Increase `MetricsCollectionIntervalSeconds` (default 60)
2. Reduce `HeartbeatIntervalSeconds` if set very low
3. Disable unused website pings

### Service Fails to Start

```powershell
# Check service account permissions
sc.exe qc CygnetCI-Agent

# Run as a different account if needed
sc.exe config CygnetCI-Agent obj= ".\LocalSystem"

# Or use a specific account
sc.exe config CygnetCI-Agent obj= "DOMAIN\ServiceAccount" password= "password"
```

### Check Event Logs

```powershell
# Application log
Get-EventLog -LogName Application -Source "*CygnetCI*" -Newest 50

# System log (for service issues)
Get-EventLog -LogName System -Source "Service Control Manager" -Newest 20 |
    Where-Object { $_.Message -like "*CygnetCI*" }
```

---

## Website Ping Configuration

### Adding Websites to Monitor

Edit `appsettings.json`:

```json
"WebsitePings": [
  {
    "Name": "Production Website",
    "Url": "https://www.example.com",
    "TimeoutSeconds": 10,
    "Enabled": true
  },
  {
    "Name": "Internal API",
    "Url": "http://internal-api.local:8080/health",
    "TimeoutSeconds": 5,
    "Enabled": true
  },
  {
    "Name": "Staging (Disabled)",
    "Url": "https://staging.example.com",
    "TimeoutSeconds": 10,
    "Enabled": false
  }
]
```

### Website Ping Options

| Option | Description |
|--------|-------------|
| `Name` | Display name in dashboard |
| `Url` | Full URL to ping (http or https) |
| `TimeoutSeconds` | How long to wait before marking as failed |
| `Enabled` | Set to false to disable without removing |

---

## Security Best Practices

1. **Unique UUIDs**: Each agent must have a unique `AgentUuid`
2. **HTTPS**: Use HTTPS for `ServerUrl` in production
3. **Service Account**: Consider using a dedicated service account instead of LocalSystem
4. **Firewall**: Restrict outbound connections to only the API server
5. **File Permissions**: Restrict access to `appsettings.json` (contains server URL)
6. **Updates**: Keep .NET runtime and agent updated

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `net start CygnetCI-Agent` | Start service |
| `net stop CygnetCI-Agent` | Stop service |
| `sc.exe query CygnetCI-Agent` | Check service status |
| `.\CygnetCI.Agent.exe` | Run manually (for testing) |

| File | Purpose |
|------|---------|
| `C:\CygnetCI\Agent\CygnetCI.Agent.exe` | Main executable |
| `C:\CygnetCI\Agent\appsettings.json` | Configuration |
| `C:\CygnetCI\Agent\logs\` | Log files (if configured) |

| Configuration | Default | Description |
|---------------|---------|-------------|
| `HeartbeatIntervalSeconds` | 30 | Heartbeat frequency |
| `MetricsCollectionIntervalSeconds` | 60 | Metrics collection frequency |
| Offline Timeout | 120s | Agent marked offline after 2 minutes |
