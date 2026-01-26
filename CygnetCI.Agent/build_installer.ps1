# CygnetCI Agent Build and Installer Script
# This script builds the agent and creates an installer package

param(
    [string]$OutputPath = ".\dist",
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [switch]$SelfContained = $true,
    [switch]$CreateZip
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CygnetCI Agent Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$SourcePath = $PSScriptRoot
$DistPath = Join-Path $SourcePath $OutputPath
$PublishPath = Join-Path $DistPath "publish"
$InstallerPath = Join-Path $DistPath "installer"

# Step 1: Clean previous build
Write-Host "`n[1/5] Cleaning previous build..." -ForegroundColor Yellow
if (Test-Path $DistPath) {
    Remove-Item -Recurse -Force $DistPath
}
New-Item -ItemType Directory -Force -Path $DistPath | Out-Null
New-Item -ItemType Directory -Force -Path $PublishPath | Out-Null
New-Item -ItemType Directory -Force -Path $InstallerPath | Out-Null

# Step 2: Restore and Build
Write-Host "`n[2/5] Building CygnetCI.Agent..." -ForegroundColor Yellow
dotnet restore "$SourcePath\CygnetCI.Agent.csproj"
dotnet build "$SourcePath\CygnetCI.Agent.csproj" -c $Configuration

# Step 3: Publish
Write-Host "`n[3/5] Publishing self-contained application..." -ForegroundColor Yellow
$publishArgs = @(
    "publish",
    "$SourcePath\CygnetCI.Agent.csproj",
    "-c", $Configuration,
    "-r", $Runtime,
    "-o", $PublishPath
)

if ($SelfContained) {
    $publishArgs += "--self-contained", "true"
    $publishArgs += "-p:PublishSingleFile=false"
    $publishArgs += "-p:IncludeNativeLibrariesForSelfExtract=true"
}

& dotnet @publishArgs

# Step 4: Create installer files
Write-Host "`n[4/5] Creating installer files..." -ForegroundColor Yellow

# Create appsettings.json template
$appSettingsTemplate = @"
{
  "Agent": {
    "ServerUrl": "http://YOUR_SERVER_IP:8000",
    "AgentUuid": "GENERATE_NEW_GUID_HERE",
    "AgentName": "YOUR_AGENT_NAME",
    "Location": "Your Server Location",
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
        "Url": "http://YOUR_SERVER_IP:8000/monitoring/api/ping",
        "TimeoutSeconds": 5,
        "Enabled": true
      }
    ]
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft": "Warning",
      "Microsoft.Hosting.Lifetime": "Information",
      "CygnetCI.Agent": "Information"
    }
  }
}
"@
$appSettingsTemplate | Set-Content (Join-Path $InstallerPath "appsettings.json.template")

# Create install script
$installScript = @'
# CygnetCI Agent Installation Script
# Run as Administrator

param(
    [Parameter(Mandatory=$false)]
    [string]$InstallPath = "C:\Program Files\CygnetCI Agent",

    [Parameter(Mandatory=$false)]
    [string]$ServiceName = "CygnetCI.Agent",

    [Parameter(Mandatory=$false)]
    [string]$ServerUrl = "http://localhost:8000",

    [Parameter(Mandatory=$false)]
    [string]$AgentName = $env:COMPUTERNAME,

    [Parameter(Mandatory=$false)]
    [string]$AgentLocation = "Default Location"
)

$ErrorActionPreference = "Stop"

# Check for admin rights
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CygnetCI Agent Installation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Stop existing service if running
Write-Host "`n[1/6] Checking for existing service..." -ForegroundColor Yellow
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "  Stopping existing service..." -ForegroundColor Gray
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3

    Write-Host "  Removing existing service..." -ForegroundColor Gray
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

# Step 2: Create installation directory
Write-Host "`n[2/6] Creating installation directory..." -ForegroundColor Yellow
if (Test-Path $InstallPath) {
    # Backup existing config
    $configPath = Join-Path $InstallPath "appsettings.json"
    if (Test-Path $configPath) {
        $backupPath = Join-Path $InstallPath "appsettings.json.backup"
        Copy-Item $configPath $backupPath -Force
        Write-Host "  Backed up existing configuration" -ForegroundColor Gray
    }
}
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallPath "logs") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallPath "work") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallPath "downloads") | Out-Null

# Step 3: Copy files
Write-Host "`n[3/6] Copying application files..." -ForegroundColor Yellow
$sourcePath = $PSScriptRoot
Copy-Item -Path "$sourcePath\publish\*" -Destination $InstallPath -Recurse -Force

# Step 4: Configure appsettings.json
Write-Host "`n[4/6] Configuring agent..." -ForegroundColor Yellow
$configPath = Join-Path $InstallPath "appsettings.json"

# Check if backup exists and should be restored
$backupPath = Join-Path $InstallPath "appsettings.json.backup"
if (Test-Path $backupPath) {
    Write-Host "  Restoring previous configuration..." -ForegroundColor Gray
    Copy-Item $backupPath $configPath -Force
    Remove-Item $backupPath -Force
} else {
    # Create new configuration
    $agentUuid = [guid]::NewGuid().ToString()

    $config = Get-Content $configPath | ConvertFrom-Json
    $config.Agent.ServerUrl = $ServerUrl
    $config.Agent.AgentUuid = $agentUuid
    $config.Agent.AgentName = $AgentName
    $config.Agent.Location = $AgentLocation
    $config.Agent.WebsitePings[0].Url = "$ServerUrl/monitoring/api/ping"

    $config | ConvertTo-Json -Depth 10 | Set-Content $configPath

    Write-Host "  Agent UUID: $agentUuid" -ForegroundColor Cyan
}

# Step 5: Install Windows Service
Write-Host "`n[5/6] Installing Windows Service..." -ForegroundColor Yellow
$exePath = Join-Path $InstallPath "CygnetCI.Agent.exe"

sc.exe create $ServiceName binPath= "`"$exePath`"" start= auto DisplayName= "CygnetCI Agent Service" | Out-Null
sc.exe description $ServiceName "CygnetCI Monitoring and Deployment Agent - Collects metrics and executes deployment tasks" | Out-Null
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null

# Step 6: Start service
Write-Host "`n[6/6] Starting service..." -ForegroundColor Yellow
Start-Service -Name $ServiceName

# Verify
Start-Sleep -Seconds 3
$service = Get-Service -Name $ServiceName
if ($service.Status -eq "Running") {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "Installation Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Service Name: $ServiceName" -ForegroundColor Cyan
    Write-Host "Install Path: $InstallPath" -ForegroundColor Cyan
    Write-Host "Service Status: Running" -ForegroundColor Green
    Write-Host ""
    Write-Host "Configuration file: $configPath" -ForegroundColor Yellow
    Write-Host "Please verify the settings in appsettings.json" -ForegroundColor Yellow
} else {
    Write-Host "`nWARNING: Service installed but not running!" -ForegroundColor Red
    Write-Host "Check the Windows Event Log for errors" -ForegroundColor Yellow
}
'@
$installScript | Set-Content (Join-Path $InstallerPath "Install-CygnetCIAgent.ps1")

# Create uninstall script
$uninstallScript = @'
# CygnetCI Agent Uninstallation Script
# Run as Administrator

param(
    [Parameter(Mandatory=$false)]
    [string]$InstallPath = "C:\Program Files\CygnetCI Agent",

    [Parameter(Mandatory=$false)]
    [string]$ServiceName = "CygnetCI.Agent",

    [switch]$KeepConfig
)

$ErrorActionPreference = "Stop"

# Check for admin rights
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CygnetCI Agent Uninstallation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Stop service
Write-Host "`n[1/3] Stopping service..." -ForegroundColor Yellow
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
}

# Step 2: Remove service
Write-Host "`n[2/3] Removing service..." -ForegroundColor Yellow
sc.exe delete $ServiceName | Out-Null
Start-Sleep -Seconds 2

# Step 3: Remove files
Write-Host "`n[3/3] Removing files..." -ForegroundColor Yellow
if ($KeepConfig) {
    # Keep config file
    $configPath = Join-Path $InstallPath "appsettings.json"
    $tempConfig = [System.IO.Path]::GetTempFileName()
    if (Test-Path $configPath) {
        Copy-Item $configPath $tempConfig
    }

    Remove-Item -Recurse -Force $InstallPath -ErrorAction SilentlyContinue

    # Restore config
    New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
    if (Test-Path $tempConfig) {
        Copy-Item $tempConfig (Join-Path $InstallPath "appsettings.json")
        Remove-Item $tempConfig
    }
    Write-Host "  Configuration file preserved" -ForegroundColor Gray
} else {
    Remove-Item -Recurse -Force $InstallPath -ErrorAction SilentlyContinue
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Uninstallation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
'@
$uninstallScript | Set-Content (Join-Path $InstallerPath "Uninstall-CygnetCIAgent.ps1")

# Copy publish files to installer folder
Copy-Item -Path "$PublishPath\*" -Destination $InstallerPath -Recurse -Force

# Step 5: Create ZIP if requested
Write-Host "`n[5/5] Finalizing..." -ForegroundColor Yellow
if ($CreateZip) {
    $ZipPath = Join-Path $SourcePath "CygnetCI-Agent-Installer.zip"
    if (Test-Path $ZipPath) {
        Remove-Item $ZipPath
    }
    Compress-Archive -Path "$InstallerPath\*" -DestinationPath $ZipPath
    Write-Host "ZIP created: $ZipPath" -ForegroundColor Green
}

# Summary
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Build Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output directory: $InstallerPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Contents:" -ForegroundColor Yellow
Get-ChildItem $InstallerPath -File | Select-Object -First 15 | ForEach-Object { Write-Host "  - $($_.Name)" }
Write-Host "  ... and more" -ForegroundColor Gray
Write-Host ""
Write-Host "To install on target server:" -ForegroundColor Yellow
Write-Host "  1. Copy the installer folder to the target server"
Write-Host "  2. Run PowerShell as Administrator"
Write-Host "  3. Execute: .\Install-CygnetCIAgent.ps1 -ServerUrl 'http://api-server:8000'"
Write-Host ""
