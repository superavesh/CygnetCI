# CygnetCI API Build Script for IIS Deployment
# This script creates a FULLY SELF-CONTAINED deployment package
# including Python runtime - NO Python installation required on server

param(
    [string]$OutputPath = ".\dist",
    [string]$PythonVersion = "3.12.8",
    [switch]$CreateZip
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CygnetCI API Build for IIS" -ForegroundColor Cyan
Write-Host "(Self-Contained with Embedded Python)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$SourcePath = $PSScriptRoot
$DistPath = Join-Path $SourcePath $OutputPath
$PythonDir = Join-Path $DistPath "python"
$SitePackagesDir = Join-Path $PythonDir "Lib\site-packages"

# Step 1: Clean previous build
Write-Host "`n[1/7] Cleaning previous build..." -ForegroundColor Yellow
if (Test-Path $DistPath) {
    Remove-Item -Recurse -Force $DistPath
}
New-Item -ItemType Directory -Force -Path $DistPath | Out-Null

# Step 2: Download Python Embeddable Package
Write-Host "`n[2/7] Downloading Python $PythonVersion embeddable package..." -ForegroundColor Yellow
$PythonZipUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$PythonZipPath = Join-Path $env:TEMP "python-embed.zip"

try {
    Invoke-WebRequest -Uri $PythonZipUrl -OutFile $PythonZipPath -UseBasicParsing
    Write-Host "  Downloaded Python embeddable package" -ForegroundColor Gray
} catch {
    Write-Host "  Failed to download Python. Trying alternative version..." -ForegroundColor Yellow
    $PythonVersion = "3.11.9"
    $PythonZipUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
    Invoke-WebRequest -Uri $PythonZipUrl -OutFile $PythonZipPath -UseBasicParsing
    Write-Host "  Downloaded Python $PythonVersion embeddable package" -ForegroundColor Gray
}

# Extract Python
Write-Host "  Extracting Python..." -ForegroundColor Gray
New-Item -ItemType Directory -Force -Path $PythonDir | Out-Null
Expand-Archive -Path $PythonZipPath -DestinationPath $PythonDir -Force
Remove-Item $PythonZipPath

# Step 3: Configure Python for pip and packages
Write-Host "`n[3/7] Configuring Python for packages..." -ForegroundColor Yellow

# Find and modify the python*._pth file to enable site-packages
$PthFile = Get-ChildItem -Path $PythonDir -Filter "python*._pth" | Select-Object -First 1
if ($PthFile) {
    $pthContent = @"
python312.zip
.
Lib\site-packages
import site
"@
    $pthContent | Set-Content $PthFile.FullName
    Write-Host "  Configured $($PthFile.Name) for site-packages" -ForegroundColor Gray
}

# Create Lib\site-packages directory
New-Item -ItemType Directory -Force -Path $SitePackagesDir | Out-Null

# Step 4: Download and install pip
Write-Host "`n[4/7] Installing pip..." -ForegroundColor Yellow
$GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$GetPipPath = Join-Path $env:TEMP "get-pip.py"
Invoke-WebRequest -Uri $GetPipUrl -OutFile $GetPipPath -UseBasicParsing

$PythonExe = Join-Path $PythonDir "python.exe"
& $PythonExe $GetPipPath --target=$SitePackagesDir --no-warn-script-location 2>&1 | Out-Null
Remove-Item $GetPipPath
Write-Host "  Pip installed" -ForegroundColor Gray

# Step 5: Install dependencies
Write-Host "`n[5/7] Installing dependencies..." -ForegroundColor Yellow
$RequirementsPath = Join-Path $SourcePath "requirements.txt"

# Install each package to site-packages (--upgrade to handle existing packages)
$pipOutput = & $PythonExe -m pip install --target=$SitePackagesDir --upgrade --no-warn-script-location -r $RequirementsPath 2>&1
$pipOutput | ForEach-Object {
    $line = $_.ToString()
    if ($line -match "Successfully installed") {
        Write-Host "  $line" -ForegroundColor Gray
    }
}

Write-Host "  Dependencies installed" -ForegroundColor Green

# Step 6: Copy application files
Write-Host "`n[6/7] Copying application files..." -ForegroundColor Yellow
$FilesToCopy = @(
    "main.py",
    "models.py",
    "database.py",
    "config.py",
    "customer_api.py",
    "claude_service.py",
    "email_service.py",
    "requirements.txt",
    "config.ini"
)

foreach ($file in $FilesToCopy) {
    $srcFile = Join-Path $SourcePath $file
    if (Test-Path $srcFile) {
        Copy-Item $srcFile -Destination $DistPath
        Write-Host "  Copied: $file" -ForegroundColor Gray
    }
}

# Step 7: Create startup files and web.config
Write-Host "`n[7/7] Creating startup files..." -ForegroundColor Yellow

# Create logs directory
New-Item -ItemType Directory -Force -Path (Join-Path $DistPath "logs") | Out-Null

# Create start_api.bat for manual testing
$StartBatContent = @"
@echo off
cd /d %~dp0
echo Starting CygnetCI API...
echo Press Ctrl+C to stop
python\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
"@
$StartBatContent | Set-Content (Join-Path $DistPath "start_api.bat")

# Create web.config for IIS HttpPlatformHandler
$WebConfigContent = @"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
    <system.webServer>
        <!-- Remove WebDAV module which blocks PUT/DELETE methods -->
        <modules>
            <remove name="WebDAVModule"/>
        </modules>

        <handlers>
            <!-- Remove WebDAV handler -->
            <remove name="WebDAV"/>
            <!-- Allow all HTTP verbs for Python handler -->
            <add name="PythonHandler" path="*" verb="*" modules="httpPlatformHandler" resourceType="Unspecified"/>
        </handlers>

        <!-- Allow large file uploads (~4 GB max for IIS) -->
        <security>
            <requestFiltering>
                <requestLimits maxAllowedContentLength="4294967295"/>
            </requestFiltering>
        </security>

        <httpPlatform processPath="%APPL_PHYSICAL_PATH%\python\python.exe"
                      arguments="-m uvicorn main:app --host 127.0.0.1 --port %HTTP_PLATFORM_PORT%"
                      stdoutLogEnabled="true"
                      stdoutLogFile="%APPL_PHYSICAL_PATH%\logs\python"
                      startupTimeLimit="120"
                      processesPerApplication="1"
                      requestTimeout="00:30:00">
            <environmentVariables>
                <environmentVariable name="PYTHONPATH" value="%APPL_PHYSICAL_PATH%"/>
                <environmentVariable name="PYTHONDONTWRITEBYTECODE" value="1"/>
            </environmentVariables>
        </httpPlatform>
    </system.webServer>
</configuration>
"@
$WebConfigContent | Set-Content (Join-Path $DistPath "web.config")

# Create config.ini template
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

# Calculate total size
$TotalSize = (Get-ChildItem $DistPath -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB

# Create ZIP if requested
if ($CreateZip) {
    Write-Host "`nCreating ZIP archive..." -ForegroundColor Yellow
    $ZipPath = Join-Path $SourcePath "CygnetCI-API-Build.zip"
    if (Test-Path $ZipPath) {
        Remove-Item $ZipPath
    }
    Compress-Archive -Path "$DistPath\*" -DestinationPath $ZipPath -CompressionLevel Optimal
    $ZipSize = (Get-Item $ZipPath).Length / 1MB
    Write-Host "  ZIP created: $ZipPath ($([math]::Round($ZipSize, 2)) MB)" -ForegroundColor Green
}

# Summary
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Build Complete! (Self-Contained)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output directory: $DistPath" -ForegroundColor Cyan
Write-Host "Total size: $([math]::Round($TotalSize, 2)) MB" -ForegroundColor Cyan
Write-Host "Python version: $PythonVersion (embedded)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Contents:" -ForegroundColor Yellow
Write-Host "  - python\          (Embedded Python runtime)" -ForegroundColor Gray
Write-Host "  - main.py          (FastAPI application)" -ForegroundColor Gray
Write-Host "  - web.config       (IIS configuration)" -ForegroundColor Gray
Write-Host "  - start_api.bat    (Manual start script)" -ForegroundColor Gray
Write-Host "  - config.ini.template" -ForegroundColor Gray
Write-Host "  - logs\            (Log directory)" -ForegroundColor Gray
Write-Host ""
Write-Host "Deployment Steps:" -ForegroundColor Yellow
Write-Host "  1. Copy 'dist' folder (or extract ZIP) to server" -ForegroundColor White
Write-Host "  2. Rename 'config.ini.template' to 'config.ini'" -ForegroundColor White
Write-Host "  3. Update config.ini with your database settings" -ForegroundColor White
Write-Host "  4. Test: Run 'start_api.bat' to verify it works" -ForegroundColor White
Write-Host "  5. Configure IIS site pointing to this folder" -ForegroundColor White
Write-Host ""
Write-Host "NO Python installation required on server!" -ForegroundColor Green
Write-Host ""
