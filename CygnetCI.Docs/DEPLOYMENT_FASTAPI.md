# CygnetCI API Deployment Guide

Deploy FastAPI backend to Windows Server IIS with embedded Python (no Python installation required on server).

---

## Step 1: Build Package (Development Machine)

```powershell
cd "D:\Avesh\CygnetCI\SourceCode\CygnetCI\CygnetCI.Api"

# Build with ZIP for transfer
.\build_for_iis.ps1 -CreateZip
```

This creates:
- `dist/` folder with embedded Python and all dependencies
- `CygnetCI-API-Build.zip` for easy transfer

---

## Step 2: Transfer to Server

Copy `CygnetCI-API-Build.zip` to server, then extract:

```powershell
# On server
Expand-Archive -Path "C:\Temp\CygnetCI-API-Build.zip" -DestinationPath "C:\CygnetCI\API" -Force
```

---

## Step 3: Configure Application

```powershell
# Create config from template
Copy-Item "C:\CygnetCI\API\config.ini.template" "C:\CygnetCI\API\config.ini"

# Edit configuration
notepad "C:\CygnetCI\API\config.ini"
```

Update these settings in `config.ini`:
- **Database**: host, port, database, username, password
- **CORS**: Add your web server URL (e.g., `http://localhost:90`)
- **Paths**: Update `nfs_shared_root` if needed

---

## Step 4: Test Manually

```powershell
cd C:\CygnetCI\API
.\start_api.bat
```

Visit `http://localhost:8000/docs` to verify API works. Press `Ctrl+C` to stop.

---

## Step 5: Setup IIS

### 5.1 Install HttpPlatformHandler

Download and install from: https://www.iis.net/downloads/microsoft/httpplatformhandler

### 5.2 Create Application Pool

```powershell
Import-Module WebAdministration

New-WebAppPool -Name "CygnetCI-API"
Set-ItemProperty "IIS:\AppPools\CygnetCI-API" -Name "managedRuntimeVersion" -Value ""
Set-ItemProperty "IIS:\AppPools\CygnetCI-API" -Name "startMode" -Value "AlwaysRunning"
Set-ItemProperty "IIS:\AppPools\CygnetCI-API" -Name "processModel.idleTimeout" -Value "00:00:00"
```

### 5.3 Create Website

```powershell
New-Website -Name "CygnetCI-API" -Port 8000 -PhysicalPath "C:\CygnetCI\API" -ApplicationPool "CygnetCI-API"
Start-Website -Name "CygnetCI-API"
```

### 5.4 Set Permissions

```powershell
icacls "C:\CygnetCI\API" /grant "IIS_IUSRS:(OI)(CI)F" /T
icacls "C:\CygnetCI\API" /grant "IIS APPPOOL\CygnetCI-API:(OI)(CI)F" /T
```

---

## Step 6: Configure Firewall

```powershell
New-NetFirewallRule -DisplayName "CygnetCI API" -Direction Inbound -Port 8000 -Protocol TCP -Action Allow
```

---

## Step 7: Verify

```powershell
# Check status
Get-Website -Name "CygnetCI-API"

# Test API
Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing
```

---

## Quick Commands

| Action | Command |
|--------|---------|
| Start site | `Start-Website -Name "CygnetCI-API"` |
| Stop site | `Stop-Website -Name "CygnetCI-API"` |
| Restart pool | `Restart-WebAppPool -Name "CygnetCI-API"` |
| View logs | `Get-Content "C:\CygnetCI\API\logs\python*.log" -Tail 50` |

---

## Troubleshooting

**API won't start**: Run `start_api.bat` manually to see error messages

**Check logs**:
```powershell
Get-Content "C:\CygnetCI\API\logs\python*.log" -Tail 100
```

**Permission issues**:
```powershell
icacls "C:\CygnetCI\API" /grant "IIS_IUSRS:(OI)(CI)F" /T
```
