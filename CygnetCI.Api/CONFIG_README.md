# CygnetCI Configuration Guide

## Overview

CygnetCI uses a centralized configuration system via `config.ini` file. This allows easy management of database connections, file paths, server settings, and other configuration options without modifying code.

## Configuration File Location

The `config.ini` file should be placed in the same directory as `main.py`:
```
CygnetCI.Api/
├── main.py
├── config.py
├── config.ini          ← Configuration file here
├── database.py
└── models.py
```

## Configuration Sections

### 1. Database Configuration

Controls PostgreSQL database connection settings.

```ini
[database]
host = localhost
port = 5432
database = CygnetCI
username = postgres
password = Admin@123
```

**Parameters:**
- `host`: Database server hostname or IP address
- `port`: PostgreSQL port (default: 5432)
- `database`: Database name
- `username`: Database user
- `password`: Database password

**Note:** Special characters in the password are automatically handled by the config system.

### 2. File Storage Paths

Defines where uploaded scripts and artifacts are stored.

```ini
[paths]
nfs_shared_root = d:/NFSShared
scripts_folder = scripts
artifacts_folder = artifacts
```

**Parameters:**
- `nfs_shared_root`: Root directory for file storage
- `scripts_folder`: Subdirectory for scripts (relative to nfs_shared_root)
- `artifacts_folder`: Subdirectory for artifacts (relative to nfs_shared_root)

**Resulting Structure:**
```
d:/NFSShared/
├── scripts/
│   ├── v1.0.0/
│   │   └── deploy.sh
│   └── v1.0.1/
│       └── deploy.sh
└── artifacts/
    ├── v1.0.0/
    │   └── app.zip
    └── v1.0.1/
        └── app.zip
```

**Auto-creation:** The config system automatically creates these directories if they don't exist.

### 3. Server Configuration

Controls FastAPI server behavior.

```ini
[server]
host = 0.0.0.0
port = 8000
reload = true
debug = true
```

**Parameters:**
- `host`: Server bind address (0.0.0.0 = all interfaces)
- `port`: HTTP port to listen on
- `reload`: Auto-reload on code changes (true for development)
- `debug`: Enable debug mode (true for development, false for production)

### 4. CORS Configuration

Manages Cross-Origin Resource Sharing (CORS) settings.

```ini
[cors]
allowed_origins = http://localhost:3000,http://127.0.0.1:3000
allow_credentials = true
```

**Parameters:**
- `allowed_origins`: Comma-separated list of allowed frontend URLs
- `allow_credentials`: Allow cookies and credentials in requests

**Production Example:**
```ini
allowed_origins = https://cygnetci.example.com,https://app.example.com
allow_credentials = true
```

### 5. File Transfer Settings

Controls file upload behavior and validation.

```ini
[file_transfer]
max_file_size_mb = 500
allowed_script_extensions = .sh,.ps1,.py,.bat,.cmd
allowed_artifact_extensions = .zip,.tar,.gz,.jar,.war,.exe,.msi
calculate_checksum = true
```

**Parameters:**
- `max_file_size_mb`: Maximum file upload size in megabytes
- `allowed_script_extensions`: Comma-separated list of allowed script file extensions
- `allowed_artifact_extensions`: Comma-separated list of allowed artifact file extensions
- `calculate_checksum`: Whether to calculate MD5 checksums (true/false)

## Using the Configuration

### In Python Code

The configuration is loaded automatically when you import from `config`:

```python
from config import app_config

# Database
db_url = app_config.get_database_url()

# Paths
nfs_root = app_config.get_nfs_shared_root()
scripts_path = app_config.get_scripts_path()
file_path = app_config.get_file_path('script', 'v1.0.0')

# Server
host = app_config.get_server_host()
port = app_config.get_server_port()

# CORS
origins = app_config.get_allowed_origins()

# File Transfer
max_size = app_config.get_max_file_size_bytes()
should_calc_checksum = app_config.should_calculate_checksum()
```

### Configuration Methods

#### Database Methods
- `get_database_url()` - Returns full SQLAlchemy connection string
- `get_db_host()` - Database host
- `get_db_port()` - Database port (as integer)
- `get_db_name()` - Database name
- `get_db_username()` - Database username
- `get_db_password()` - Database password

#### Path Methods
- `get_nfs_shared_root()` - Root directory path
- `get_scripts_folder()` - Scripts folder name
- `get_artifacts_folder()` - Artifacts folder name
- `get_scripts_path()` - Full path to scripts folder
- `get_artifacts_path()` - Full path to artifacts folder
- `get_file_path(file_type, version)` - Full path for a specific file type and version

#### Server Methods
- `get_server_host()` - Server host
- `get_server_port()` - Server port (as integer)
- `get_server_reload()` - Reload setting (as boolean)
- `get_debug_mode()` - Debug mode (as boolean)

#### CORS Methods
- `get_allowed_origins()` - List of allowed origins
- `get_allow_credentials()` - Allow credentials (as boolean)

#### File Transfer Methods
- `get_max_file_size_mb()` - Max size in MB (as integer)
- `get_max_file_size_bytes()` - Max size in bytes (as integer)
- `get_allowed_script_extensions()` - List of allowed script extensions
- `get_allowed_artifact_extensions()` - List of allowed artifact extensions
- `should_calculate_checksum()` - Whether to calculate checksums (as boolean)
- `validate_file_extension(filename, file_type)` - Validate if file extension is allowed

#### Utility Methods
- `print_config()` - Print all configuration settings (for debugging)

## Environment-Specific Configuration

### Development Setup
```ini
[server]
host = 0.0.0.0
port = 8000
reload = true
debug = true

[cors]
allowed_origins = http://localhost:3000,http://127.0.0.1:3000
allow_credentials = true
```

### Production Setup
```ini
[server]
host = 0.0.0.0
port = 80
reload = false
debug = false

[cors]
allowed_origins = https://cygnetci.yourcompany.com
allow_credentials = true

[database]
host = prod-db-server.internal
port = 5432
database = CygnetCI_Prod
username = cygnetci_app
password = YOUR_SECURE_PASSWORD_HERE
```

## Troubleshooting

### Configuration File Not Found

**Error:**
```
FileNotFoundError: Configuration file 'config.ini' not found
```

**Solution:**
1. Ensure `config.ini` exists in the same directory as `main.py`
2. Check file permissions
3. Verify the filename is exactly `config.ini` (case-sensitive on Linux)

### Database Connection Fails

**Error:**
```
sqlalchemy.exc.OperationalError: connection to server failed
```

**Solution:**
1. Verify database settings in `config.ini`
2. Check PostgreSQL service is running
3. Test connection: `psql -U postgres -h localhost -p 5432 -d CygnetCI`
4. Ensure firewall allows connections on port 5432

### CORS Errors in Browser

**Error:**
```
Access to fetch at 'http://localhost:8000/...' from origin 'http://localhost:3000' has been blocked by CORS policy
```

**Solution:**
1. Add your frontend URL to `allowed_origins` in config.ini
2. Ensure no trailing slashes in URLs
3. Restart the FastAPI server after config changes

### File Upload Fails

**Error:**
```
HTTP error! status: 400 - File too large
```

**Solution:**
1. Increase `max_file_size_mb` in config.ini
2. Restart server after changes
3. Check available disk space in NFSShared folder

### Directories Not Created

**Solution:**
The config system automatically creates directories. If they're not being created:
1. Check permissions on the parent directory
2. Verify the path in `nfs_shared_root` is valid
3. Check logs for permission errors

## Configuration Validation

On startup, the config system:
1. ✅ Validates config file exists
2. ✅ Creates NFS root directory if needed
3. ✅ Creates scripts and artifacts subdirectories
4. ✅ Prints configuration summary to console

**Startup Output:**
```
Connecting to database: CygnetCI at localhost:5432
Created directory: d:/NFSShared/scripts
Created directory: d:/NFSShared/artifacts
============================================================
CygnetCI Configuration
============================================================

[Database]
  URL: postgresql://postgres:***@localhost:5432/CygnetCI

[Paths]
  NFS Root: d:/NFSShared
  Scripts: d:/NFSShared/scripts
  Artifacts: d:/NFSShared/artifacts

[Server]
  Host: 0.0.0.0
  Port: 8000
  Reload: True
  Debug: True

[CORS]
  Allowed Origins: http://localhost:3000, http://127.0.0.1:3000

[File Transfer]
  Max File Size: 500 MB
  Script Extensions: .sh, .ps1, .py, .bat, .cmd
  Artifact Extensions: .zip, .tar, .gz, .jar, .war, .exe, .msi
============================================================
```

## Best Practices

1. **Security:**
   - Never commit `config.ini` with real passwords to version control
   - Use environment-specific config files (dev, staging, prod)
   - Restrict file permissions on `config.ini`: `chmod 600 config.ini`

2. **Backup:**
   - Keep a template `config.ini.template` in version control
   - Document all required settings
   - Store production config securely

3. **Changes:**
   - Restart the FastAPI server after config changes
   - Test configuration in development before applying to production
   - Keep a backup of working configuration

4. **Paths:**
   - Use absolute paths for `nfs_shared_root`
   - Use forward slashes (/) even on Windows (they work in Python)
   - Ensure sufficient disk space for file uploads

## Example Template

Create `config.ini.template` for version control:

```ini
# CygnetCI Configuration Template
# Copy to config.ini and fill in your values

[database]
host = localhost
port = 5432
database = CygnetCI
username = postgres
password = CHANGE_ME

[paths]
nfs_shared_root = /path/to/NFSShared
scripts_folder = scripts
artifacts_folder = artifacts

[server]
host = 0.0.0.0
port = 8000
reload = true
debug = true

[cors]
allowed_origins = http://localhost:3000
allow_credentials = true

[file_transfer]
max_file_size_mb = 500
allowed_script_extensions = .sh,.ps1,.py,.bat,.cmd
allowed_artifact_extensions = .zip,.tar,.gz,.jar,.war,.exe,.msi
calculate_checksum = true
```

## Summary

The configuration system provides:
- ✅ Centralized configuration management
- ✅ Easy environment-specific settings
- ✅ Automatic directory creation
- ✅ Type-safe configuration access
- ✅ Validation and error checking
- ✅ Clear separation of code and configuration

For questions or issues, refer to the troubleshooting section or check the application logs.
