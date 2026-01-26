# CygnetCI Agent MSI Builder
# This script builds the MSI installer using the WiX project

param(
    [string]$Configuration = "Release",
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CygnetCI Agent MSI Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$InstallerDir = $PSScriptRoot
$ProjectFile = Join-Path $InstallerDir "CygnetCI.Agent.Installer.wixproj"

# Step 1: Clean
Write-Host "`n[1/3] Cleaning previous build..." -ForegroundColor Yellow
$binDir = Join-Path $InstallerDir "bin"
$objDir = Join-Path $InstallerDir "obj"
if (Test-Path $binDir) { Remove-Item -Recurse -Force $binDir }
if (Test-Path $objDir) { Remove-Item -Recurse -Force $objDir }

# Step 2: Build MSI
Write-Host "`n[2/3] Building MSI installer..." -ForegroundColor Yellow
Write-Host "  This may take a few minutes..." -ForegroundColor Gray

dotnet build $ProjectFile -c $Configuration

if ($LASTEXITCODE -ne 0) {
    throw "MSI build failed with exit code $LASTEXITCODE"
}

# Step 3: Verify and Copy
Write-Host "`n[3/3] Verifying MSI..." -ForegroundColor Yellow
$msiPath = Join-Path $InstallerDir "bin\$Configuration\CygnetCI.Agent.Setup.msi"

if (Test-Path $msiPath) {
    $msiSize = (Get-Item $msiPath).Length / 1MB

    # Copy to output path if specified
    if ($OutputPath) {
        if (-not (Test-Path $OutputPath)) {
            New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null
        }
        $destPath = Join-Path $OutputPath "CygnetCI.Agent.Setup.msi"
        Copy-Item $msiPath $destPath -Force
        $msiPath = $destPath
    }

    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "MSI Build Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "MSI File: $msiPath" -ForegroundColor Cyan
    Write-Host "Size: $([math]::Round($msiSize, 2)) MB" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Installation Options:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Double-click the MSI file to install with GUI" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. Install with basic UI:" -ForegroundColor Gray
    Write-Host "     msiexec /i `"$msiPath`" /qb" -ForegroundColor White
    Write-Host ""
    Write-Host "  3. Install silently:" -ForegroundColor Gray
    Write-Host "     msiexec /i `"$msiPath`" /qn" -ForegroundColor White
    Write-Host ""
    Write-Host "  4. Install to custom location:" -ForegroundColor Gray
    Write-Host "     msiexec /i `"$msiPath`" INSTALLFOLDER=`"D:\CustomPath`" /qb" -ForegroundColor White
    Write-Host ""
    Write-Host "Uninstallation:" -ForegroundColor Yellow
    Write-Host "  - Use Windows Settings > Apps > CygnetCI Agent > Uninstall" -ForegroundColor Gray
    Write-Host "  - Or: msiexec /x `"$msiPath`" /qb" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Post-Installation:" -ForegroundColor Yellow
    Write-Host "  1. Edit config: C:\Program Files\CygnetCI Agent\appsettings.json" -ForegroundColor Gray
    Write-Host "  2. Set ServerUrl to your CygnetCI API server" -ForegroundColor Gray
    Write-Host "  3. Restart service: Restart-Service CygnetCI.Agent" -ForegroundColor Gray
} else {
    throw "MSI file was not created at expected path: $msiPath"
}
