# CygnetCI Web Deployment Guide (Next.js on IIS)

This guide covers building the CygnetCI Next.js frontend locally and deploying as static files to Windows IIS.

---

## Overview

This deployment method:
- Builds the Next.js app locally (on your development machine)
- Exports as static HTML/CSS/JS files
- Copies files to Windows Server
- Hosts on IIS without requiring Node.js on the server

---

## Prerequisites

### On Development Machine (Build Machine)
- Node.js 18.x or later
- npm or yarn
- Access to source code

### On Windows Server (Production)
- Windows Server 2019/2022
- IIS installed
- No Node.js required!

---

## Part 1: Build on Development Machine

### Step 1.1: Install Dependencies

```powershell
cd "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Web\cygnetci-web"

# Install dependencies
npm install
```

### Step 1.2: Configure API URL

Edit `public\system.config.js` with your production API URL:

```javascript
// CygnetCI Runtime Configuration
// This file can be modified after deployment without rebuilding

window.CYGNETCI_CONFIG = {
  api: {
    baseUrl: 'http://your-server-ip:8000',  // Your production API URL
  },
  app: {
    name: 'CygnetCI',
    version: '1.0.0',
    pollingInterval: 30000
  }
};
```

### Step 1.3: Build Static Export

```powershell
cd "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Web\cygnetci-web"

# Build the application (creates 'out' folder with static files)
npm run build
```

After build completes, you'll have an `out` folder containing all static files:

```
out/
├── index.html
├── login/
│   └── index.html
├── dashboard/
│   └── index.html
├── agents/
│   └── index.html
├── _next/
│   ├── static/
│   │   ├── css/
│   │   ├── chunks/
│   │   └── media/
├── system.config.js
├── favicon.ico
└── ... other static assets
```

### Step 1.4: Verify Build Output

```powershell
# Check the out folder exists and has content
Get-ChildItem "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Web\cygnetci-web\out" -Recurse | Measure-Object

# Should show several hundred files
```

---

## Part 2: Deploy to Windows Server

### Step 2.1: Copy Files to Server

**Option A: Direct Copy (if on same network)**

```powershell
# From development machine, copy to server
Copy-Item -Path "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Web\cygnetci-web\out\*" `
    -Destination "\\SERVER-NAME\C$\inetpub\cygnetci" `
    -Recurse -Force
```

**Option B: Create ZIP and Transfer**

```powershell
# On development machine - create ZIP
Compress-Archive -Path "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Web\cygnetci-web\out\*" `
    -DestinationPath "D:\CygnetCI-Web-Build.zip" -Force

# Transfer ZIP to server via:
# - USB drive
# - File share
# - SCP/SFTP
# - Remote Desktop copy/paste

# On server - extract ZIP
Expand-Archive -Path "C:\Temp\CygnetCI-Web-Build.zip" `
    -DestinationPath "C:\inetpub\cygnetci" -Force
```

**Option C: Using Robocopy (recommended for updates)**

```powershell
# Fast incremental copy
robocopy "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Web\cygnetci-web\out" `
    "\\SERVER-NAME\C$\inetpub\cygnetci" /MIR /Z /W:5 /R:3
```

---

## Part 3: Configure IIS on Windows Server

### Step 3.1: Install IIS

```powershell
# Run on Windows Server as Administrator
Install-WindowsFeature -Name Web-Server -IncludeManagementTools

# Install URL Rewrite Module (required for SPA routing)
# Download from: https://www.iis.net/downloads/microsoft/url-rewrite
# Run the installer
```

### Step 3.2: Create Website Directory

```powershell
# Create directory if not exists
New-Item -ItemType Directory -Force -Path "C:\inetpub\cygnetci"

# Set permissions
icacls "C:\inetpub\cygnetci" /grant "IIS_IUSRS:(OI)(CI)R" /T
icacls "C:\inetpub\cygnetci" /grant "IUSR:(OI)(CI)R" /T
```

### Step 3.3: Create web.config for IIS

Create `C:\inetpub\cygnetci\web.config`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system.webServer>
        <!-- Enable static content compression -->
        <urlCompression doStaticCompression="true" doDynamicCompression="false" />

        <!-- Set default document -->
        <defaultDocument>
            <files>
                <clear />
                <add value="index.html" />
            </files>
        </defaultDocument>

        <!-- MIME types for Next.js static files -->
        <staticContent>
            <remove fileExtension=".js" />
            <mimeMap fileExtension=".js" mimeType="application/javascript" />
            <remove fileExtension=".json" />
            <mimeMap fileExtension=".json" mimeType="application/json" />
            <remove fileExtension=".woff" />
            <mimeMap fileExtension=".woff" mimeType="font/woff" />
            <remove fileExtension=".woff2" />
            <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
            <remove fileExtension=".svg" />
            <mimeMap fileExtension=".svg" mimeType="image/svg+xml" />
        </staticContent>

        <!-- Caching for static assets -->
        <caching>
            <profiles>
                <add extension=".js" policy="CacheUntilChange" kernelCachePolicy="CacheUntilChange" />
                <add extension=".css" policy="CacheUntilChange" kernelCachePolicy="CacheUntilChange" />
                <add extension=".html" policy="CacheUntilChange" kernelCachePolicy="CacheUntilChange" />
            </profiles>
        </caching>

        <!-- URL Rewrite rules for SPA routing -->
        <rewrite>
            <rules>
                <!-- Handle client-side routing -->
                <rule name="SPA Routes" stopProcessing="true">
                    <match url=".*" />
                    <conditions logicalGrouping="MatchAll">
                        <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
                        <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
                        <add input="{REQUEST_URI}" pattern="^/_next/" negate="true" />
                        <add input="{REQUEST_URI}" pattern="\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|json)$" negate="true" />
                    </conditions>
                    <action type="Rewrite" url="/index.html" />
                </rule>
            </rules>
        </rewrite>

        <!-- Security headers -->
        <httpProtocol>
            <customHeaders>
                <add name="X-Content-Type-Options" value="nosniff" />
                <add name="X-Frame-Options" value="SAMEORIGIN" />
                <add name="X-XSS-Protection" value="1; mode=block" />
            </customHeaders>
        </httpProtocol>

        <!-- Error pages -->
        <httpErrors errorMode="Custom" existingResponse="Replace">
            <remove statusCode="404" />
            <error statusCode="404" path="/index.html" responseMode="ExecuteURL" />
        </httpErrors>
    </system.webServer>
</configuration>
```

### Step 3.4: Create IIS Website

**Using PowerShell:**

```powershell
Import-Module WebAdministration

# Remove default website (optional)
# Remove-Website -Name "Default Web Site"

# Create application pool
New-WebAppPool -Name "CygnetCI"
Set-ItemProperty -Path "IIS:\AppPools\CygnetCI" -Name "managedRuntimeVersion" -Value ""
Set-ItemProperty -Path "IIS:\AppPools\CygnetCI" -Name "startMode" -Value "AlwaysRunning"

# Create website
New-Website -Name "CygnetCI" `
    -Port 80 `
    -PhysicalPath "C:\inetpub\cygnetci" `
    -ApplicationPool "CygnetCI"

# Start the website
Start-Website -Name "CygnetCI"
```

**Using IIS Manager (GUI):**

1. Open IIS Manager (`inetmgr`)
2. Right-click "Sites" → "Add Website"
3. Configure:
   - Site name: `CygnetCI`
   - Physical path: `C:\inetpub\cygnetci`
   - Port: `80`
4. Click OK

### Step 3.5: Verify Website is Running

```powershell
# Check website status
Get-Website -Name "CygnetCI"

# Test locally
Start-Process "http://localhost"

# Test from another machine
# http://your-server-ip
```

---

## Part 4: Configure API URL After Deployment

The `system.config.js` file can be modified on the server to change the API URL without rebuilding.

### Edit Configuration on Server

```powershell
notepad "C:\inetpub\cygnetci\system.config.js"
```

Update the API URL:

```javascript
window.CYGNETCI_CONFIG = {
  api: {
    baseUrl: 'http://192.168.1.100:8000',  // Your actual API server
  },
  app: {
    name: 'CygnetCI',
    version: '1.0.0',
    pollingInterval: 30000
  }
};
```

**No IIS restart needed!** Changes take effect when users refresh their browser.

---

## Part 5: Configure HTTPS (Recommended for Production)

### Step 5.1: Obtain SSL Certificate

**Option A: Purchase Certificate**
- Purchase from DigiCert, Comodo, Let's Encrypt, etc.
- Export as PFX file

**Option B: Use Let's Encrypt (Free)**

Install win-acme:

```powershell
# Download from https://www.win-acme.com/
# Extract to C:\Tools\win-acme
# Run to get certificate
C:\Tools\win-acme\wacs.exe
```

**Option C: Self-Signed Certificate (Testing Only)**

```powershell
# Create self-signed certificate
$cert = New-SelfSignedCertificate `
    -DnsName "cygnetci.local", "localhost" `
    -CertStoreLocation "cert:\LocalMachine\My" `
    -NotAfter (Get-Date).AddYears(5)

$cert.Thumbprint
```

### Step 5.2: Bind Certificate to IIS

```powershell
# Get certificate thumbprint
$cert = Get-ChildItem -Path Cert:\LocalMachine\My |
    Where-Object { $_.Subject -like "*cygnetci*" -or $_.Subject -like "*yourdomain*" }

# Add HTTPS binding
New-WebBinding -Name "CygnetCI" -Protocol "https" -Port 443

# Assign certificate
$binding = Get-WebBinding -Name "CygnetCI" -Protocol "https"
$binding.AddSslCertificate($cert.Thumbprint, "My")
```

### Step 5.3: Force HTTPS Redirect (Optional)

Add to `web.config` inside `<rules>` section:

```xml
<rule name="HTTPS Redirect" stopProcessing="true">
    <match url="(.*)" />
    <conditions>
        <add input="{HTTPS}" pattern="off" ignoreCase="true" />
    </conditions>
    <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
</rule>
```

---

## Part 6: Configure Windows Firewall

```powershell
# Allow HTTP
New-NetFirewallRule -DisplayName "CygnetCI Web (HTTP)" `
    -Direction Inbound -Port 80 -Protocol TCP -Action Allow

# Allow HTTPS
New-NetFirewallRule -DisplayName "CygnetCI Web (HTTPS)" `
    -Direction Inbound -Port 443 -Protocol TCP -Action Allow
```

---

## Updating the Application

### Update Script (Run on Development Machine)

Create `deploy-web.ps1`:

```powershell
# CygnetCI Web Deployment Script
param(
    [Parameter(Mandatory=$true)]
    [string]$ServerPath,  # e.g., "\\SERVER01\C$\inetpub\cygnetci" or "C:\inetpub\cygnetci"

    [string]$SourcePath = "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Web\cygnetci-web"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CygnetCI Web Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Build
Write-Host "`nBuilding application..." -ForegroundColor Yellow
Push-Location $SourcePath
npm run build

if (-not (Test-Path "out")) {
    Write-Host "Build failed - 'out' folder not found" -ForegroundColor Red
    exit 1
}
Pop-Location

# Step 2: Backup server config
Write-Host "`nBacking up server configuration..." -ForegroundColor Yellow
$serverConfigPath = Join-Path $ServerPath "system.config.js"
$configBackup = $null
if (Test-Path $serverConfigPath) {
    $configBackup = Get-Content $serverConfigPath -Raw
}

$webConfigPath = Join-Path $ServerPath "web.config"
$webConfigBackup = $null
if (Test-Path $webConfigPath) {
    $webConfigBackup = Get-Content $webConfigPath -Raw
}

# Step 3: Deploy files
Write-Host "`nDeploying files to server..." -ForegroundColor Yellow
$outPath = Join-Path $SourcePath "out"
robocopy $outPath $ServerPath /MIR /Z /W:5 /R:3 /XF "web.config"

# Step 4: Restore config
if ($configBackup) {
    Write-Host "Restoring system.config.js..." -ForegroundColor Gray
    $configBackup | Set-Content $serverConfigPath
}

if ($webConfigBackup) {
    Write-Host "Restoring web.config..." -ForegroundColor Gray
    $webConfigBackup | Set-Content $webConfigPath
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Server: $ServerPath"
```

### Usage

```powershell
# Deploy to local server
.\deploy-web.ps1 -ServerPath "C:\inetpub\cygnetci"

# Deploy to remote server
.\deploy-web.ps1 -ServerPath "\\SERVER01\C$\inetpub\cygnetci"
```

---

## Troubleshooting

### Page Shows "404 Not Found"

1. Verify `web.config` exists in `C:\inetpub\cygnetci`
2. Ensure URL Rewrite module is installed
3. Check IIS has permission to read files

```powershell
# Re-apply permissions
icacls "C:\inetpub\cygnetci" /grant "IIS_IUSRS:(OI)(CI)R" /T
```

### Page Shows Blank or JavaScript Errors

1. Check browser console for errors (F12)
2. Verify `system.config.js` is loading
3. Check API URL is correct and API is accessible

```powershell
# Test API from server
Invoke-WebRequest -Uri "http://your-api-server:8000/health" -UseBasicParsing
```

### Static Files Not Loading (_next folder)

1. Check MIME types in `web.config`
2. Verify files exist in `C:\inetpub\cygnetci\_next`

```powershell
# Check files exist
Get-ChildItem "C:\inetpub\cygnetci\_next" -Recurse | Measure-Object
```

### Login Redirects Not Working

This is expected with static export. The app handles routing client-side.

1. Ensure URL Rewrite rules are in `web.config`
2. Clear browser cache and try again

### CORS Errors

The API must allow requests from the web server:

1. Check API CORS settings include the web server URL
2. Update FastAPI CORS origins:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://your-web-server",
        "https://your-web-server",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Check IIS Logs

```powershell
# View recent IIS logs
Get-Content "C:\inetpub\logs\LogFiles\W3SVC1\*.log" -Tail 50
```

---

## Quick Reference

### Build Commands (Development Machine)

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run build` | Build static export to `out` folder |
| `npm run dev` | Run development server (testing) |

### Server Paths

| Path | Description |
|------|-------------|
| `C:\inetpub\cygnetci\` | Website root directory |
| `C:\inetpub\cygnetci\system.config.js` | Runtime API configuration |
| `C:\inetpub\cygnetci\web.config` | IIS configuration |
| `C:\inetpub\cygnetci\_next\` | Next.js static assets |

### IIS Commands

| Command | Description |
|---------|-------------|
| `iisreset` | Restart IIS |
| `Start-Website -Name "CygnetCI"` | Start website |
| `Stop-Website -Name "CygnetCI"` | Stop website |
| `Get-Website -Name "CygnetCI"` | Check status |

### URLs

| URL | Description |
|-----|-------------|
| `http://your-server/` | Web application |
| `http://your-server/login/` | Login page |
| `http://your-server/dashboard/` | Dashboard |

---

## Summary

1. **Build locally**: `npm run build` creates `out` folder
2. **Copy to server**: Transfer `out` folder contents to `C:\inetpub\cygnetci`
3. **Add web.config**: For IIS routing and MIME types
4. **Create IIS website**: Point to `C:\inetpub\cygnetci`
5. **Configure API URL**: Edit `system.config.js` on server
6. **No Node.js needed**: Server only needs IIS!
