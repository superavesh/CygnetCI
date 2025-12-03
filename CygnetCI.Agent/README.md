# CygnetCI Agent

A .NET-based agent for the CygnetCI continuous integration and deployment system.

## Features

- **Cross-Platform**: Runs on Windows, Linux, and macOS
- **Automatic Registration**: Self-registers with the CygnetCI server on first run
- **Heartbeat Monitoring**: Sends system metrics (CPU, Memory) every 30 seconds
- **Task Execution**: Executes CI/CD scripts (PowerShell, Bash, Python, Batch)
- **File Transfer**: Automatically downloads and manages scripts and artifacts
- **Windows Service / Linux Daemon**: Can run as a background service
- **Concurrent Execution**: Supports multiple parallel task executions

## Prerequisites

- .NET 9.0 Runtime or SDK
- Network access to CygnetCI API server
- Appropriate permissions to execute scripts

## Configuration

Edit `appsettings.json` to configure the agent:

```json
{
  "Agent": {
    "ServerUrl": "http://127.0.0.1:8000",
    "AgentUuid": "",
    "AgentName": "",
    "Location": "Data Center 1",
    "HeartbeatIntervalSeconds": 30,
    "TaskPollingIntervalSeconds": 5,
    "FilePollingIntervalSeconds": 10,
    "WorkingDirectory": "",
    "DownloadsDirectory": "",
    "MaxConcurrentTasks": 3,
    "ScriptTimeoutSeconds": 3600
  }
}
```

### Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `ServerUrl` | CygnetCI API server URL | `http://127.0.0.1:8000` |
| `AgentUuid` | Unique identifier (auto-generated if empty) | Empty (auto-generate) |
| `AgentName` | Display name | Machine name |
| `Location` | Physical/logical location | "Default Location" |
| `HeartbeatIntervalSeconds` | How often to send heartbeat | 30 |
| `TaskPollingIntervalSeconds` | How often to check for tasks | 5 |
| `FilePollingIntervalSeconds` | How often to check for file transfers | 10 |
| `WorkingDirectory` | Directory for script execution | `{app}/work` |
| `DownloadsDirectory` | Directory for downloaded files | `{app}/downloads` |
| `MaxConcurrentTasks` | Maximum parallel tasks | 3 |
| `ScriptTimeoutSeconds` | Default script timeout | 3600 (1 hour) |

## Running the Agent

### Development Mode

```bash
dotnet run
```

### Production Build

```bash
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true
```

Replace `win-x64` with:
- `linux-x64` for Linux
- `osx-x64` for macOS

## Installing as Windows Service

### Using sc.exe

```powershell
# Build
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true

# Install service
sc create "CygnetCI Agent" binPath="C:\Path\To\CygnetCI.Agent.exe" start=auto

# Start service
sc start "CygnetCI Agent"

# Stop service
sc stop "CygnetCI Agent"

# Delete service
sc delete "CygnetCI Agent"
```

### Using PowerShell

```powershell
New-Service -Name "CygnetCI Agent" -BinaryPathName "C:\Path\To\CygnetCI.Agent.exe" -StartupType Automatic
Start-Service "CygnetCI Agent"
```

## Installing as Linux Systemd Service

### 1. Build the Agent

```bash
dotnet publish -c Release -r linux-x64 --self-contained -p:PublishSingleFile=true
```

### 2. Copy to System Directory

```bash
sudo mkdir -p /opt/cygnetci/agent
sudo cp bin/Release/net9.0/linux-x64/publish/CygnetCI.Agent /opt/cygnetci/agent/
sudo cp appsettings.json /opt/cygnetci/agent/
sudo chmod +x /opt/cygnetci/agent/CygnetCI.Agent
```

### 3. Create Systemd Service File

Create `/etc/systemd/system/cygnetci-agent.service`:

```ini
[Unit]
Description=CygnetCI Agent
After=network.target

[Service]
Type=notify
ExecStart=/opt/cygnetci/agent/CygnetCI.Agent
Restart=always
RestartSec=10
User=cygnetci
WorkingDirectory=/opt/cygnetci/agent
Environment="DOTNET_PRINT_TELEMETRY_MESSAGE=false"

[Install]
WantedBy=multi-user.target
```

### 4. Create User and Set Permissions

```bash
sudo useradd -r -s /bin/false cygnetci
sudo chown -R cygnetci:cygnetci /opt/cygnetci
```

### 5. Enable and Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable cygnetci-agent
sudo systemctl start cygnetci-agent
sudo systemctl status cygnetci-agent
```

### 6. View Logs

```bash
sudo journalctl -u cygnetci-agent -f
```

## Supported Script Types

| Extension | Executor | Platform |
|-----------|----------|----------|
| `.ps1` | PowerShell | Windows/Linux/macOS |
| `.sh` | Bash | Windows (via WSL/Git Bash)/Linux/macOS |
| `.py` | Python | All (requires Python installed) |
| `.bat`, `.cmd` | CMD | Windows only |

## Architecture

### Services

- **HeartbeatService**: Sends system metrics to server every 30 seconds
- **TaskExecutionService**: Polls for and executes CI/CD tasks
- **FileTransferService**: Downloads scripts and artifacts from server
- **SystemMonitorService**: Collects CPU and memory usage

### Workflow

```
1. Agent starts → Registers with server
2. Background services start:
   ├─ Heartbeat (every 30s) → Send metrics to server
   ├─ Task Polling (every 5s) → Check for pending tasks
   │   └─ Execute tasks concurrently (max 3)
   └─ File Transfer (every 10s) → Download pending files
       └─ Verify checksums → Acknowledge downloads
```

## Troubleshooting

### Agent Won't Register

- Check `ServerUrl` in appsettings.json
- Verify network connectivity to API server
- Check API server logs for errors

### Tasks Not Executing

- Verify agent is online in CygnetCI web UI
- Check that tasks are assigned to this agent
- Ensure script files are downloaded to agent
- Check agent logs for errors

### File Downloads Failing

- Verify checksum matches
- Check network connectivity
- Ensure sufficient disk space
- Check file permissions

### Performance Issues

- Reduce `MaxConcurrentTasks` if system is overloaded
- Increase heartbeat/polling intervals to reduce network traffic
- Check system resources (CPU, Memory, Disk)

## Logging

The agent logs to:
- **Console** (when running interactively)
- **Event Log** (Windows Service)
- **Systemd Journal** (Linux Daemon)

Log levels can be configured in `appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "CygnetCI.Agent": "Debug"
    }
  }
}
```

## Security Considerations

- **Network Security**: Use HTTPS for production deployments
- **Authentication**: API endpoints should require authentication
- **Script Validation**: Validate scripts before execution
- **Sandboxing**: Consider running scripts in isolated environments
- **File Permissions**: Ensure agent has appropriate file system permissions

## Directory Structure

```
CygnetCI.Agent/
├── work/                   # Working directory for script execution
├── downloads/              # Downloaded scripts and artifacts
│   ├── scripts/
│   │   └── {version}/     # Scripts organized by version
│   └── artifacts/
│       └── {version}/     # Artifacts organized by version
├── CygnetCI.Agent.exe     # Agent executable
└── appsettings.json       # Configuration file
```

## License

Copyright © 2025 CygnetCI
