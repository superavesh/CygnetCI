using System.ServiceProcess;
using System.Text.Json;
using CygnetCI.Agent.Http;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Services;

public class CommandExecutionService : ICommandExecutionService
{
    private readonly ILogger<CommandExecutionService> _logger;
    private readonly ICygnetApiClient _apiClient;
    private readonly AgentConfiguration _config;

    public CommandExecutionService(
        ILogger<CommandExecutionService> logger,
        ICygnetApiClient apiClient,
        IOptions<AgentConfiguration> config)
    {
        _logger = logger;
        _apiClient = apiClient;
        _config = config.Value;
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
