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
