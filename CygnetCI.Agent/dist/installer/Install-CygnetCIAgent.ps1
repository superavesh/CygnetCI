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
