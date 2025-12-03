using System.Diagnostics;
using CygnetCI.Agent.Http;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Services;

public class TaskExecutionService : ITaskExecutionService
{
    private readonly ILogger<TaskExecutionService> _logger;
    private readonly ICygnetApiClient _apiClient;
    private readonly AgentConfiguration _config;
    private readonly SemaphoreSlim _semaphore;

    public TaskExecutionService(
        ILogger<TaskExecutionService> logger,
        ICygnetApiClient apiClient,
        IOptions<AgentConfiguration> config)
    {
        _logger = logger;
        _apiClient = apiClient;
        _config = config.Value;
        _semaphore = new SemaphoreSlim(config.Value.MaxConcurrentTasks);
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Task execution service starting with polling interval: {Interval}s",
            _config.TaskPollingIntervalSeconds);

        // Ensure working directory exists
        Directory.CreateDirectory(_config.WorkingDirectory);

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_config.TaskPollingIntervalSeconds));

        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            try
            {
                _logger.LogDebug("Polling for pending tasks...");
                var tasks = await _apiClient.GetPendingTasksAsync(cancellationToken);

                _logger.LogDebug("Found {Count} pending tasks", tasks.Count);

                foreach (var task in tasks)
                {
                    _logger.LogInformation("Found task: {TaskName} (ID: {TaskId})",
                        task.Name, task.Id);
                    // Fire and forget - execute in background
                    _ = ExecuteTaskAsync(task, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to poll tasks");
            }
        }
    }

    private async Task ExecuteTaskAsync(TaskInfo task, CancellationToken cancellationToken)
    {
        // Wait for available slot
        await _semaphore.WaitAsync(cancellationToken);

        try
        {
            _logger.LogInformation("Executing task {TaskId}: {TaskName}", task.Id, task.Name);

            var scriptPath = Path.Combine(_config.DownloadsDirectory, task.ScriptPath);

            if (!File.Exists(scriptPath))
            {
                _logger.LogError("Script file not found: {ScriptPath}", scriptPath);
                await _apiClient.CompleteTaskAsync(task.Id, false, -1, cancellationToken);
                return;
            }

            var (fileName, arguments) = GetScriptExecutor(scriptPath);

            var processInfo = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                WorkingDirectory = _config.WorkingDirectory,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            // Add environment variables
            if (task.EnvironmentVariables != null)
            {
                foreach (var (key, value) in task.EnvironmentVariables)
                {
                    processInfo.EnvironmentVariables[key] = value;
                }
            }

            using var process = new Process { StartInfo = processInfo };

            // Handle output
            process.OutputDataReceived += async (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    _logger.LogInformation("[Task {TaskId}] {Output}", task.Id, e.Data);
                    await _apiClient.StreamLogAsync(task.Id, e.Data, cancellationToken);
                }
            };

            process.ErrorDataReceived += async (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    _logger.LogError("[Task {TaskId}] {Error}", task.Id, e.Data);
                    await _apiClient.StreamLogAsync(task.Id, $"ERROR: {e.Data}", cancellationToken);
                }
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            // Wait with timeout
            var timeout = TimeSpan.FromSeconds(task.TimeoutSeconds > 0 ? task.TimeoutSeconds : _config.ScriptTimeoutSeconds);

            try
            {
                await process.WaitForExitAsync(cancellationToken).WaitAsync(timeout, cancellationToken);
            }
            catch (TimeoutException)
            {
                _logger.LogWarning("Task {TaskId} timed out after {Timeout}s, killing process", task.Id, timeout.TotalSeconds);
                process.Kill(true);
                await _apiClient.CompleteTaskAsync(task.Id, false, -1, cancellationToken);
                return;
            }

            var success = process.ExitCode == 0;
            await _apiClient.CompleteTaskAsync(task.Id, success, process.ExitCode, cancellationToken);

            _logger.LogInformation("Task {TaskId} completed with exit code {ExitCode}",
                task.Id, process.ExitCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute task {TaskId}", task.Id);
            await _apiClient.CompleteTaskAsync(task.Id, false, -1, cancellationToken);
        }
        finally
        {
            _semaphore.Release();
        }
    }

    private (string fileName, string arguments) GetScriptExecutor(string scriptPath)
    {
        var extension = Path.GetExtension(scriptPath).ToLowerInvariant();

        return extension switch
        {
            ".ps1" => ("powershell.exe", $"-ExecutionPolicy Bypass -File \"{scriptPath}\""),
            ".sh" => (OperatingSystem.IsWindows() ? "bash" : "/bin/bash", $"\"{scriptPath}\""),
            ".py" => ("python", $"\"{scriptPath}\""),
            ".bat" or ".cmd" => ("cmd.exe", $"/c \"{scriptPath}\""),
            _ => throw new NotSupportedException($"Script type {extension} not supported")
        };
    }
}
