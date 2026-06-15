using System.ServiceProcess;
using System.Text;
using System.Text.Json;
using CygnetCI.Agent.Http;
using CygnetCI.Agent.Models;
using CygnetCI.Agent.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Win32;

namespace CygnetCI.Agent.Services;

public class CommandExecutionService : ICommandExecutionService
{
    private readonly ILogger<CommandExecutionService> _logger;
    private readonly ICygnetApiClient _apiClient;
    private readonly AgentConfiguration _config;
    private readonly IArgocdService? _argocd;

    public CommandExecutionService(
        ILogger<CommandExecutionService> logger,
        ICygnetApiClient apiClient,
        IOptions<AgentConfiguration> config,
        IArgocdService? argocd = null)
    {
        _logger = logger;
        _apiClient = apiClient;
        _config = config.Value;
        _argocd = argocd;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Command execution service starting with polling interval: {Interval}s",
            _config.TaskPollingIntervalSeconds);

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_config.TaskPollingIntervalSeconds));

        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            try
            {
                _logger.LogDebug("Polling for pending commands...");
                var commands = await _apiClient.GetPendingCommandsAsync(cancellationToken);

                if (commands.Count > 0)
                {
                    _logger.LogDebug("Found {Count} pending commands", commands.Count);
                }

                foreach (var command in commands)
                {
                    _logger.LogInformation("Processing command: {CommandType} (ID: {CommandId})",
                        command.CommandType, command.Id);

                    // Execute command (don't fire and forget - process sequentially)
                    await ExecuteCommandAsync(command, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to poll commands");
            }
        }
    }

    private async Task ExecuteCommandAsync(AgentCommandInfo command, CancellationToken cancellationToken)
    {
        try
        {
            // Mark command as started
            await _apiClient.StartCommandAsync(command.Id, cancellationToken);

            string result;
            bool success;

            switch (command.CommandType)
            {
                case "service_control":
                    (success, result) = await ExecuteServiceControlAsync(command.CommandData, cancellationToken);
                    break;
                case "k8s_onboard":
                    (success, result) = await ExecuteK8sOnboardAsync(command.CommandData, cancellationToken);
                    break;
                case "k8s_argocd_sync":
                    (success, result) = await ExecuteArgoCdSyncAsync(command.CommandData, cancellationToken);
                    break;
                case "service_log_list":
                    (success, result) = await ExecuteServiceLogListAsync(command.CommandData, cancellationToken);
                    break;
                case "service_log_read":
                    (success, result) = await ExecuteServiceLogReadAsync(command.CommandData, cancellationToken);
                    break;
                default:
                    success = false;
                    result = $"Unknown command type: {command.CommandType}";
                    _logger.LogWarning("Unknown command type: {CommandType}", command.CommandType);
                    break;
            }

            // Mark command as completed
            await _apiClient.CompleteCommandAsync(command.Id, success, result, cancellationToken);

            _logger.LogInformation("Command {CommandId} completed: {Success} - {Result}",
                command.Id, success, result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute command {CommandId}", command.Id);
            await _apiClient.CompleteCommandAsync(command.Id, false, ex.Message, cancellationToken);
        }
    }

    // SECURITY: service names are interpolated into systemctl arguments and used to build
    // registry paths. Restrict them to a conservative character set to prevent argument
    // injection (e.g. a name like "nginx --some-flag" or one containing path separators).
    private static bool IsValidServiceName(string? name) =>
        !string.IsNullOrEmpty(name)
        && name.Length <= 256
        && System.Text.RegularExpressions.Regex.IsMatch(name, @"^[A-Za-z0-9._@\-]+$");

    private async Task<(bool success, string result)> ExecuteServiceControlAsync(string commandData, CancellationToken cancellationToken)
    {
        try
        {
            var options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
            };
            var serviceCommand = JsonSerializer.Deserialize<ServiceControlCommand>(commandData, options);

            if (serviceCommand == null || string.IsNullOrEmpty(serviceCommand.ServiceName))
            {
                return (false, "Invalid command data: service name is required");
            }

            if (!IsValidServiceName(serviceCommand.ServiceName))
            {
                return (false, "Invalid service name");
            }

            _logger.LogInformation("Executing service control: {Action} {ServiceName}",
                serviceCommand.Action, serviceCommand.ServiceName);

            if (OperatingSystem.IsLinux())
            {
                return await ExecuteLinuxServiceControlAsync(serviceCommand.ServiceName, serviceCommand.Action, cancellationToken);
            }

            if (!OperatingSystem.IsWindows())
            {
                return (false, "Service control is only supported on Windows and Linux");
            }

            return await Task.Run(() =>
            {
                try
                {
                    using var sc = new ServiceController(serviceCommand.ServiceName);

                    var currentStatus = sc.Status;
                    _logger.LogInformation("Service {ServiceName} current status: {Status}",
                        serviceCommand.ServiceName, currentStatus);

                    if (serviceCommand.Action.ToLower() == "start")
                    {
                        if (currentStatus == ServiceControllerStatus.Running)
                        {
                            return (true, $"Service '{serviceCommand.ServiceName}' is already running");
                        }

                        sc.Start();
                        sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));
                        return (true, $"Service '{serviceCommand.ServiceName}' started successfully");
                    }
                    else if (serviceCommand.Action.ToLower() == "stop")
                    {
                        if (currentStatus == ServiceControllerStatus.Stopped)
                        {
                            return (true, $"Service '{serviceCommand.ServiceName}' is already stopped");
                        }

                        sc.Stop();
                        sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(30));
                        return (true, $"Service '{serviceCommand.ServiceName}' stopped successfully");
                    }
                    else
                    {
                        return (false, $"Unknown action: {serviceCommand.Action}");
                    }
                }
                catch (InvalidOperationException ex)
                {
                    _logger.LogError(ex, "Service not found or access denied: {ServiceName}", serviceCommand.ServiceName);
                    return (false, $"Service not found or access denied: {ex.Message}");
                }
                catch (System.ServiceProcess.TimeoutException ex)
                {
                    _logger.LogError(ex, "Timeout waiting for service {ServiceName}", serviceCommand.ServiceName);
                    return (false, $"Timeout waiting for service to {serviceCommand.Action}: {ex.Message}");
                }
            }, cancellationToken);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse service control command data");
            return (false, $"Failed to parse command data: {ex.Message}");
        }
    }

    // ─── K8s / ArgoCD Handlers ────────────────────────────────────────────────

    private async Task<(bool success, string result)> ExecuteK8sOnboardAsync(
        string commandData, CancellationToken cancellationToken)
    {
        if (_argocd == null)
            return (false, "ArgoCD is not enabled on this agent. Set ArgoCD.Enabled=true in config.");

        try
        {
            var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
            var definition = JsonSerializer.Deserialize<ArgocdAppDefinition>(commandData, options);
            if (definition == null || string.IsNullOrEmpty(definition.AppName))
                return (false, "Invalid command data: AppName is required");

            return await _argocd.CreateApplicationAsync(definition.ClusterName, definition, cancellationToken);
        }
        catch (JsonException ex)
        {
            return (false, $"Failed to parse k8s_onboard command data: {ex.Message}");
        }
    }

    private async Task<(bool success, string result)> ExecuteArgoCdSyncAsync(
        string commandData, CancellationToken cancellationToken)
    {
        if (_argocd == null)
            return (false, "ArgoCD is not enabled on this agent. Set ArgoCD.Enabled=true in config.");

        try
        {
            var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
            var syncCmd = JsonSerializer.Deserialize<ArgocdSyncCommand>(commandData, options);
            if (syncCmd == null || string.IsNullOrEmpty(syncCmd.AppName))
                return (false, "Invalid command data: AppName is required");

            // Trigger sync
            var (triggerOk, triggerMsg) = await _argocd.SyncApplicationAsync(
                syncCmd.ClusterName, syncCmd.AppName, syncCmd.ImageRepository, syncCmd.ImageTag, cancellationToken);

            if (!triggerOk) return (false, triggerMsg);

            // Wait for completion
            return await _argocd.WaitForSyncAsync(syncCmd.ClusterName, syncCmd.AppName, cancellationToken);
        }
        catch (JsonException ex)
        {
            return (false, $"Failed to parse k8s_argocd_sync command data: {ex.Message}");
        }
    }

    // ─── Service Log File Handlers ────────────────────────────────────────────

    /// <summary>
    /// Lists log files found in the service's installation directory (logs/ subfolder).
    /// Returns JSON: { logs_dir, files: [{ name, size_bytes, modified }] }
    /// </summary>
    private async Task<(bool success, string result)> ExecuteServiceLogListAsync(
        string commandData, CancellationToken cancellationToken)
    {
        try
        {
            using var doc = JsonDocument.Parse(commandData);
            var serviceName = doc.RootElement.TryGetProperty("service_name", out var sn) ? sn.GetString() ?? "" : "";

            if (string.IsNullOrEmpty(serviceName))
                return (false, "service_name is required");
            if (!IsValidServiceName(serviceName))
                return (false, "Invalid service name");

            var logsDir = FindServiceLogsDirectory(serviceName);
            if (logsDir == null)
                return (false, $"Could not locate logs directory for service '{serviceName}'");

            var extensions = new[] { ".log", ".txt" };
            var files = Directory.EnumerateFiles(logsDir)
                .Where(f => extensions.Any(ext => f.EndsWith(ext, StringComparison.OrdinalIgnoreCase)))
                .OrderByDescending(f => File.GetLastWriteTime(f))
                .Take(100)
                .Select(f =>
                {
                    var info = new FileInfo(f);
                    return new { name = info.Name, size_bytes = info.Length, modified = info.LastWriteTimeUtc.ToString("o") };
                })
                .ToList();

            var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
            return (true, JsonSerializer.Serialize(new { logs_dir = logsDir, files }, options));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list service log files");
            return (false, $"Error listing log files: {ex.Message}");
        }
    }

    /// <summary>
    /// Reads the last portion of a log file and pushes the content directly to a dedicated
    /// FastAPI endpoint (avoids routing large payloads through the command-result mechanism
    /// which can cause 502 errors when an IIS reverse proxy has a request-body size limit).
    /// </summary>
    private async Task<(bool success, string result)> ExecuteServiceLogReadAsync(
        string commandData, CancellationToken cancellationToken)
    {
        try
        {
            using var doc = JsonDocument.Parse(commandData);
            var root = doc.RootElement;
            var serviceName = root.TryGetProperty("service_name", out var sn) ? sn.GetString() ?? "" : "";
            var fileName    = root.TryGetProperty("file_name",    out var fn) ? fn.GetString() ?? "" : "";
            var maxKb       = root.TryGetProperty("max_kb",       out var mk) ? mk.GetInt32() : 512;

            if (string.IsNullOrEmpty(serviceName) || string.IsNullOrEmpty(fileName))
                return (false, "service_name and file_name are required");
            if (!IsValidServiceName(serviceName))
                return (false, "Invalid service name");

            // Reject path traversal attempts
            if (fileName.Contains("..") || Path.IsPathRooted(fileName))
                return (false, "Invalid file name");

            var logsDir = FindServiceLogsDirectory(serviceName);
            if (logsDir == null)
                return (false, $"Could not locate logs directory for service '{serviceName}'");

            var filePath = Path.Combine(logsDir, fileName);
            if (!File.Exists(filePath))
                return (false, $"File not found: {fileName}");

            // Safety: only read files within the logs directory
            var resolvedFile = Path.GetFullPath(filePath);
            var resolvedDir  = Path.GetFullPath(logsDir);
            if (!resolvedFile.StartsWith(resolvedDir, StringComparison.OrdinalIgnoreCase))
                return (false, "Access denied");

            var maxBytes = maxKb * 1024;
            string content;
            long totalBytes;
            bool truncated;

            using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                totalBytes = fs.Length;
                truncated  = fs.Length > maxBytes;
                if (truncated) fs.Seek(-maxBytes, SeekOrigin.End);
                var readLen = (int)Math.Min(maxBytes, fs.Length - fs.Position);
                var buffer  = new byte[readLen];
                var read    = await fs.ReadAsync(buffer, 0, readLen, cancellationToken);
                content = Encoding.UTF8.GetString(buffer, 0, read);
                // Start from first complete line if content is truncated
                if (truncated)
                {
                    var newline = content.IndexOf('\n');
                    if (newline >= 0) content = content[(newline + 1)..];
                }
            }

            // Push content via dedicated endpoint — do NOT include it in the command result
            // to avoid large JSON payloads hitting IIS request-body size limits.
            await _apiClient.PostServiceLogContentAsync(
                serviceName, fileName, logsDir, content, truncated, totalBytes, cancellationToken);

            return (true, "ready");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to read service log file");
            return (false, $"Error reading log file: {ex.Message}");
        }
    }

    /// <summary>
    /// Finds the logs directory for a service.
    /// Windows: reads ImagePath from registry → exe directory → looks for logs/ subfolder.
    /// Linux: reads WorkingDirectory from systemctl → looks for logs/ subfolder.
    /// </summary>
    private string? FindServiceLogsDirectory(string serviceName)
    {
        string? serviceDir = null;

        if (OperatingSystem.IsWindows())
        {
            try
            {
                using var key = Registry.LocalMachine.OpenSubKey(
                    $@"SYSTEM\CurrentControlSet\Services\{serviceName}");
                var imagePath = key?.GetValue("ImagePath")?.ToString();
                if (!string.IsNullOrEmpty(imagePath))
                {
                    // Strip surrounding quotes and arguments after the .exe
                    imagePath = imagePath.Trim().TrimStart('"');
                    var exeEnd = imagePath.IndexOf(".exe", StringComparison.OrdinalIgnoreCase);
                    if (exeEnd >= 0)
                        imagePath = imagePath[..(exeEnd + 4)];

                    if (File.Exists(imagePath))
                        serviceDir = Path.GetDirectoryName(imagePath);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read registry for service {ServiceName}", serviceName);
            }
        }
        else if (OperatingSystem.IsLinux())
        {
            try
            {
                // Try WorkingDirectory first
                using var p1 = new System.Diagnostics.Process();
                p1.StartInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "systemctl",
                    Arguments = $"show {serviceName} --property=WorkingDirectory --value",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                p1.Start();
                var wd = p1.StandardOutput.ReadToEnd().Trim();
                p1.WaitForExit(3000);

                if (!string.IsNullOrEmpty(wd) && wd != "/" && Directory.Exists(wd))
                {
                    serviceDir = wd;
                }
                else
                {
                    // Fall back: parse ExecStart to get exe directory
                    using var p2 = new System.Diagnostics.Process();
                    p2.StartInfo = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "systemctl",
                        Arguments = $"show {serviceName} --property=ExecStart --value",
                        RedirectStandardOutput = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    p2.Start();
                    var execStart = p2.StandardOutput.ReadToEnd().Trim();
                    p2.WaitForExit(3000);

                    // ExecStart format: "{ path=/usr/bin/dotnet ; argv[]=/usr/bin/dotnet /opt/app/App.dll ; ... }"
                    // For .NET services the launcher is dotnet and the real app is the .dll argument.
                    // Prefer: extract the first .dll path from argv[] (gives the app directory).
                    var dllMatch = System.Text.RegularExpressions.Regex.Match(
                        execStart, @"argv\[\]=[^;]+\s(/[^\s;]+\.dll)");
                    if (dllMatch.Success)
                    {
                        serviceDir = Path.GetDirectoryName(dllMatch.Groups[1].Value);
                    }
                    else
                    {
                        // Non-.NET service: use the path= executable directory
                        var pathMatch = System.Text.RegularExpressions.Regex.Match(execStart, @"path=([^;}\s]+)");
                        if (pathMatch.Success)
                        {
                            var exePath = pathMatch.Groups[1].Value;
                            // Skip generic launchers like /usr/bin/dotnet
                            if (!exePath.StartsWith("/usr/bin/") && !exePath.StartsWith("/usr/local/bin/"))
                                serviceDir = Path.GetDirectoryName(exePath);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to get service directory via systemctl for {ServiceName}", serviceName);
            }
        }

        if (serviceDir == null || !Directory.Exists(serviceDir))
            return null;

        // Look for a logs/ subfolder (common naming conventions)
        foreach (var candidate in new[] { "logs", "Logs", "log", "Log" })
        {
            var logsPath = Path.Combine(serviceDir, candidate);
            if (Directory.Exists(logsPath))
                return logsPath;
        }

        // No logs/ subfolder — return the service directory itself
        return serviceDir;
    }

    private async Task<(bool success, string result)> ExecuteLinuxServiceControlAsync(
        string serviceName, string action, CancellationToken cancellationToken)
    {
        var normalizedAction = action.ToLower() switch
        {
            "start"   => "start",
            "stop"    => "stop",
            "restart" => "restart",
            _ => null
        };

        if (normalizedAction == null)
            return (false, $"Unknown action: {action}. Supported actions: start, stop, restart");

        return await Task.Run(() =>
        {
            try
            {
                using var process = new System.Diagnostics.Process();
                process.StartInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName  = "systemctl",
                    Arguments = $"{normalizedAction} {serviceName}",
                    RedirectStandardOutput = true,
                    RedirectStandardError  = true,
                    UseShellExecute  = false,
                    CreateNoWindow   = true
                };

                process.Start();
                var stdout = process.StandardOutput.ReadToEnd();
                var stderr = process.StandardError.ReadToEnd();
                process.WaitForExit(30_000);

                if (process.ExitCode == 0)
                {
                    return (true, $"Service '{serviceName}' {normalizedAction}ed successfully");
                }
                else
                {
                    var msg = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
                    return (false, $"systemctl {normalizedAction} {serviceName} failed (exit {process.ExitCode}): {msg.Trim()}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to execute systemctl {Action} {ServiceName}", normalizedAction, serviceName);
                return (false, $"Failed to execute systemctl {normalizedAction}: {ex.Message}");
            }
        }, cancellationToken);
    }
}
