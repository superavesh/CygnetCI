# CygnetCI Database Deployment Guide (PostgreSQL)

This guide covers deploying and configuring PostgreSQL database for CygnetCI on Windows Server.

---

## Prerequisites

- Windows Server 2019/2022 or Windows 10/11
- Administrator access
- Minimum 2GB RAM (4GB recommended)
- 10GB free disk space

---

## Step 1: Download and Install PostgreSQL

### 1.1 Download PostgreSQL

1. Visit: https://www.postgresql.org/download/windows/
2. Click "Download the installer"
3. Download PostgreSQL 16.x (or latest stable version)
4. Choose Windows x86-64 installer

### 1.2 Run Installer

1. Run the downloaded installer as Administrator
2. Follow the installation wizard:
   - **Installation Directory**: `C:\Program Files\PostgreSQL\16` (default)
   - **Data Directory**: `C:\Program Files\PostgreSQL\16\data` (default)
   - **Password**: Set a strong password for the `postgres` superuser (save this!)
   - **Port**: `5432` (default)
   - **Locale**: Default locale
3. Complete the installation (uncheck Stack Builder at the end)

### 1.3 Add to System PATH

```powershell
# Run in PowerShell as Administrator
$pgPath = "C:\Program Files\PostgreSQL\16\bin"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($currentPath -notlike "*$pgPath*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$pgPath", "Machine")
}

# Verify (open new PowerShell window)
psql --version
```

---

## Step 2: Configure PostgreSQL

### 2.1 Configure Authentication

Edit `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`:

```powershell
# Open in notepad as Administrator
notepad "C:\Program Files\PostgreSQL\16\data\pg_hba.conf"
```

Ensure these lines are present for local connections:

```
# IPv4 local connections:
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256

# Allow connections from local network (if needed)
# host    all             all             192.168.1.0/24          scram-sha-256
```

### 2.2 Configure Server Settings

Edit `C:\Program Files\PostgreSQL\16\data\postgresql.conf`:

```powershell
notepad "C:\Program Files\PostgreSQL\16\data\postgresql.conf"
```

Recommended settings for CygnetCI:

```ini
# Connection Settings
listen_addresses = 'localhost'          # Change to '*' if remote access needed
port = 5432
max_connections = 100

# Memory Settings (adjust based on server RAM)
shared_buffers = 256MB                  # 25% of RAM, max 1GB for Windows
effective_cache_size = 768MB            # 75% of RAM
work_mem = 4MB
maintenance_work_mem = 64MB

# Logging
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_statement = 'ddl'                   # Log DDL statements
log_min_duration_statement = 1000       # Log queries taking > 1 second

# Performance
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
```

### 2.3 Restart PostgreSQL Service

```powershell
# Restart service to apply changes
Restart-Service -Name "postgresql-x64-16"

# Verify service is running
Get-Service -Name "postgresql-x64-16"
```

---

## Step 3: Create CygnetCI Database

### 3.1 Connect to PostgreSQL

```powershell
# Connect as superuser
psql -U postgres -h localhost
```

Enter the password you set during installation.

### 3.2 Create Database and User

Run the following SQL commands in psql:

```sql
-- Create the CygnetCI database
CREATE DATABASE cygnetci
    WITH
    ENCODING = 'UTF8'
    LC_COLLATE = 'English_United States.1252'
    LC_CTYPE = 'English_United States.1252'
    TEMPLATE = template0;

-- Create dedicated user for CygnetCI
CREATE USER cygnetci_user WITH ENCRYPTED PASSWORD 'YourSecurePassword123!';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE cygnetci TO cygnetci_user;

-- Connect to the new database
\c cygnetci

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO cygnetci_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cygnetci_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cygnetci_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO cygnetci_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO cygnetci_user;

-- Exit psql
\q
```

### 3.3 Verify Connection

```powershell
# Test connection with new user
psql -U cygnetci_user -d cygnetci -h localhost

# If connected, run a simple query
SELECT version();

# Exit
\q
```

---

## Step 4: Database Connection String

Use this connection string in your applications:

### For Python (SQLAlchemy/FastAPI)

```python
DATABASE_URL = "postgresql://cygnetci_user:YourSecurePassword123!@localhost:5432/cygnetci"
```

### For .NET (Entity Framework)

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=cygnetci;Username=cygnetci_user;Password=YourSecurePassword123!"
  }
}
```

### For Environment Variables

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cygnetci
DB_USER=cygnetci_user
DB_PASSWORD=YourSecurePassword123!
```

---

## Step 5: Windows Firewall Configuration

### 5.1 Allow Local Connections Only (Recommended)

By default, PostgreSQL listens only on localhost. No firewall changes needed.

### 5.2 Allow Remote Connections (If Required)

```powershell
# Only if you need remote database access
New-NetFirewallRule -DisplayName "PostgreSQL" `
    -Direction Inbound `
    -Port 5432 `
    -Protocol TCP `
    -Action Allow `
    -Profile Domain,Private

# For specific IP only (more secure)
New-NetFirewallRule -DisplayName "PostgreSQL - Specific IP" `
    -Direction Inbound `
    -Port 5432 `
    -Protocol TCP `
    -Action Allow `
    -RemoteAddress "192.168.1.100"
```

---

## Step 6: Backup Configuration

### 6.1 Create Backup Directory

```powershell
New-Item -ItemType Directory -Force -Path "C:\CygnetCI\Backups\Database"
```

### 6.2 Create Backup Script

Create `C:\CygnetCI\Backups\backup_database.ps1`:

```powershell
# CygnetCI Database Backup Script
# Run as scheduled task for automated backups

param(
    [string]$BackupPath = "C:\CygnetCI\Backups\Database",
    [int]$RetentionDays = 7
)

# Configuration
$DbHost = "localhost"
$DbPort = 5432
$DbName = "cygnetci"
$DbUser = "cygnetci_user"

# Set PGPASSWORD environment variable (or use .pgpass file)
$env:PGPASSWORD = "YourSecurePassword123!"

# Generate timestamp
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupPath "cygnetci_$Timestamp.sql"
$CompressedFile = "$BackupFile.gz"

# Ensure backup directory exists
if (-not (Test-Path $BackupPath)) {
    New-Item -ItemType Directory -Force -Path $BackupPath
}

Write-Host "Starting database backup..." -ForegroundColor Cyan
Write-Host "Backup file: $BackupFile"

try {
    # Create backup
    pg_dump -h $DbHost -p $DbPort -U $DbUser -d $DbName -F p -f $BackupFile

    if (Test-Path $BackupFile) {
        # Get file size
        $Size = (Get-Item $BackupFile).Length / 1MB
        Write-Host "Backup created successfully: $([math]::Round($Size, 2)) MB" -ForegroundColor Green

        # Compress backup (optional - requires 7-Zip or similar)
        # & "C:\Program Files\7-Zip\7z.exe" a -tgzip $CompressedFile $BackupFile
        # Remove-Item $BackupFile
    } else {
        throw "Backup file was not created"
    }

    # Cleanup old backups
    Write-Host "Cleaning up backups older than $RetentionDays days..." -ForegroundColor Yellow
    Get-ChildItem -Path $BackupPath -Filter "cygnetci_*.sql*" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
        ForEach-Object {
            Write-Host "  Removing: $($_.Name)"
            Remove-Item $_.FullName
        }

    Write-Host "Backup completed successfully!" -ForegroundColor Green
}
catch {
    Write-Host "Backup failed: $_" -ForegroundColor Red
    exit 1
}
finally {
    # Clear password from environment
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
```

### 6.3 Schedule Automated Backups

```powershell
# Create scheduled task for daily backups at 2 AM
$Action = New-ScheduledTaskAction `
    -Execute "PowerShell.exe" `
    -Argument "-ExecutionPolicy Bypass -File C:\CygnetCI\Backups\backup_database.ps1"

$Trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM

$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
    -TaskName "CygnetCI-DatabaseBackup" `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Daily CygnetCI database backup" `
    -User "SYSTEM" `
    -RunLevel Highest
```

### 6.4 Restore from Backup

```powershell
# Stop services that use the database
Stop-Service -Name "CygnetCI-API" -ErrorAction SilentlyContinue

# Restore database
$env:PGPASSWORD = "YourSecurePassword123!"
psql -h localhost -U cygnetci_user -d cygnetci -f "C:\CygnetCI\Backups\Database\cygnetci_20260124_020000.sql"

# Restart services
Start-Service -Name "CygnetCI-API"
```

---

## Step 7: Performance Monitoring

### 7.1 Check Database Size

```sql
-- Connect to database
psql -U cygnetci_user -d cygnetci -h localhost

-- Check database size
SELECT pg_size_pretty(pg_database_size('cygnetci'));

-- Check table sizes
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;
```

### 7.2 Check Active Connections

```sql
SELECT
    pid,
    usename,
    application_name,
    client_addr,
    state,
    query_start,
    query
FROM pg_stat_activity
WHERE datname = 'cygnetci';
```

### 7.3 Check Slow Queries

```sql
-- Enable pg_stat_statements extension first
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- View slow queries
SELECT
    query,
    calls,
    total_exec_time / 1000 as total_seconds,
    mean_exec_time / 1000 as avg_seconds
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

---

## Troubleshooting

### PostgreSQL Service Won't Start

```powershell
# Check Windows Event Log
Get-EventLog -LogName Application -Source "postgresql*" -Newest 20

# Check PostgreSQL logs
Get-Content "C:\Program Files\PostgreSQL\16\data\log\*.log" -Tail 100

# Common issues:
# - Port already in use: netstat -ano | findstr :5432
# - Data directory permissions: Check NTFS permissions on data folder
# - Corrupted data: Run pg_resetwal (last resort, may lose data)
```

### Connection Refused

```powershell
# Verify service is running
Get-Service postgresql*

# Check if listening on correct port
netstat -ano | findstr :5432

# Test local connection
psql -U postgres -h localhost -c "SELECT 1"
```

### Authentication Failed

1. Check username and password
2. Verify pg_hba.conf allows your connection method
3. Restart PostgreSQL after pg_hba.conf changes

```powershell
Restart-Service -Name "postgresql-x64-16"
```

### Out of Disk Space

```powershell
# Check disk space
Get-PSDrive C

# Identify large tables
psql -U cygnetci_user -d cygnetci -c "
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
LIMIT 10;
"

# Vacuum and analyze to reclaim space
psql -U cygnetci_user -d cygnetci -c "VACUUM FULL ANALYZE;"
```

---

## Security Best Practices

1. **Strong Passwords**: Use complex passwords for all database users
2. **Limited Access**: Only allow connections from localhost unless absolutely necessary
3. **Separate User**: Never use the `postgres` superuser for application connections
4. **Regular Backups**: Automated daily backups with off-site storage
5. **Monitor Logs**: Regularly review PostgreSQL logs for suspicious activity
6. **Keep Updated**: Apply PostgreSQL security updates promptly
7. **Encrypt Connections**: Enable SSL for remote connections
8. **Audit Access**: Use `log_connections` and `log_disconnections` in postgresql.conf

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `psql -U postgres` | Connect as superuser |
| `psql -U cygnetci_user -d cygnetci` | Connect as app user |
| `\l` | List all databases |
| `\dt` | List tables in current database |
| `\du` | List users |
| `\q` | Quit psql |
| `pg_dump -U user -d db > backup.sql` | Backup database |
| `psql -U user -d db < backup.sql` | Restore database |

| Service Command | Description |
|-----------------|-------------|
| `Get-Service postgresql*` | Check service status |
| `Start-Service postgresql-x64-16` | Start PostgreSQL |
| `Stop-Service postgresql-x64-16` | Stop PostgreSQL |
| `Restart-Service postgresql-x64-16` | Restart PostgreSQL |
