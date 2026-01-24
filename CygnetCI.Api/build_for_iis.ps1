# CygnetCI API Build Script for IIS Deployment
# This script creates a self-contained deployment package

param(
    [string]$OutputPath = ".\dist",
    [switch]$CreateZip
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CygnetCI API Build for IIS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$SourcePath = $PSScriptRoot
$DistPath = Join-Path $SourcePath $OutputPath

# Step 1: Clean previous build
Write-Host "`n[1/6] Cleaning previous build..." -ForegroundColor Yellow
if (Test-Path $DistPath) {
    Remove-Item -Recurse -Force $DistPath
}
New-Item -ItemType Directory -Force -Path $DistPath | Out-Null

# Step 2: Create virtual environment in dist folder
Write-Host "`n[2/6] Creating virtual environment..." -ForegroundColor Yellow
$VenvPath = Join-Path $DistPath "venv"
python -m venv $VenvPath

# Step 3: Install dependencies
Write-Host "`n[3/6] Installing dependencies..." -ForegroundColor Yellow
$PipPath = Join-Path $VenvPath "Scripts\pip.exe"
& $PipPath install --upgrade pip
& $PipPath install -r (Join-Path $SourcePath "requirements.txt")

# Step 4: Copy application files
Write-Host "`n[4/6] Copying application files..." -ForegroundColor Yellow
$FilesToCopy = @(
    "main.py",
    "models.py",
    "database.py",
    "config.py",
    "customer_api.py",
    "claude_service.py",
    "email_service.py",
    "requirements.txt",
    "config.ini",
    "web.config",
    "run_server.py"
)

foreach ($file in $FilesToCopy) {
    $srcFile = Join-Path $SourcePath $file
    if (Test-Path $srcFile) {
        Copy-Item $srcFile -Destination $DistPath
        Write-Host "  Copied: $file" -ForegroundColor Gray
    }
}

# Copy __pycache__ exclusion
$ExcludeFolders = @("__pycache__", "venv", "dist", ".git", ".idea", ".vscode")

# Step 5: Create startup files
Write-Host "`n[5/6] Creating startup files..." -ForegroundColor Yellow

# Create run_server.py if not exists
$RunServerContent = @"
# run_server.py - Entry point for IIS
import uvicorn
from main import app

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
"@
$RunServerContent | Set-Content (Join-Path $DistPath "run_server.py")

# Create start_api.bat
$StartBatContent = @"
@echo off
cd /d %~dp0
call venv\Scripts\activate.bat
python -m uvicorn main:app --host 127.0.0.1 --port 8000
"@
$StartBatContent | Set-Content (Join-Path $DistPath "start_api.bat")

# Create web.config for IIS HttpPlatformHandler
$WebConfigContent = @"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
    <system.webServer>
        <handlers>
            <add name="PythonHandler" path="*" verb="*" modules="httpPlatformHandler" resourceType="Unspecified"/>
        </handlers>
        <httpPlatform processPath="%HOME%\venv\Scripts\python.exe"
                      arguments="-m uvicorn main:app --host 127.0.0.1 --port %HTTP_PLATFORM_PORT%"
                      stdoutLogEnabled="true"
                      stdoutLogFile=".\logs\python-stdout"
                      startupTimeLimit="60"
                      processesPerApplication="1">
            <environmentVariables>
                <environmentVariable name="PYTHONPATH" value="%HOME%"/>
            </environmentVariables>
        </httpPlatform>
    </system.webServer>
</configuration>
"@
$WebConfigContent | Set-Content (Join-Path $DistPath "web.config")

# Create logs directory
New-Item -ItemType Directory -Force -Path (Join-Path $DistPath "logs") | Out-Null

# Step 6: Create config.ini template
Write-Host "`n[6/6] Creating configuration template..." -ForegroundColor Yellow
$ConfigTemplate = @"
# CygnetCI Configuration File
# IMPORTANT: Update these settings for your production environment

[database]
# PostgreSQL Database Configuration
host = localhost
port = 5432
database = CygnetCI
username = cygnetci_user
password = YOUR_SECURE_PASSWORD_HERE

[paths]
# File Storage Paths - Update for your server
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
# CORS Configuration - Update with your web server URL
allowed_origins = http://localhost,http://your-web-server
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
"@
$ConfigTemplate | Set-Content (Join-Path $DistPath "config.ini.template")

# Create ZIP if requested
if ($CreateZip) {
    Write-Host "`nCreating ZIP archive..." -ForegroundColor Yellow
    $ZipPath = Join-Path $SourcePath "CygnetCI-API-Build.zip"
    if (Test-Path $ZipPath) {
        Remove-Item $ZipPath
    }
    Compress-Archive -Path "$DistPath\*" -DestinationPath $ZipPath
    Write-Host "ZIP created: $ZipPath" -ForegroundColor Green
}

# Summary
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Build Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output directory: $DistPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Contents:" -ForegroundColor Yellow
Get-ChildItem $DistPath | ForEach-Object { Write-Host "  - $($_.Name)" }
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Copy the 'dist' folder contents to your server"
Write-Host "  2. Rename 'config.ini.template' to 'config.ini'"
Write-Host "  3. Update config.ini with your production settings"
Write-Host "  4. Configure IIS (see DEPLOYMENT_FASTAPI.md)"
Write-Host ""
