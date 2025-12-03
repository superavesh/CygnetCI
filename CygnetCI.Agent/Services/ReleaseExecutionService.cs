using System.Diagnostics;
using System.Text;
using CygnetCI.Agent.Http;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Services;

public class ReleaseExecutionService : IReleaseExecutionService
{
    private readonly ILogger<ReleaseExecutionService> _logger;
    private readonly ICygnetApiClient _apiClient;
    private readonly AgentConfiguration _config;
    private readonly SemaphoreSlim _semaphore;

    public ReleaseExecutionService(
        ILogger<ReleaseExecutionService> logger,
        ICygnetApiClient apiClient,
        IOptions<AgentConfiguration> config)
    {
        _logger = logger;
        _apiClient = apiClient;
        _config = config.Value;
        _semaphore = new SemaphoreSlim(config.Value.MaxConcurrentReleases);
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Release execution service starting with polling interval: {Interval}s",
            _config.ReleasePollingIntervalSeconds);

        // Ensure working directory exists
        Directory.CreateDirectory(_config.WorkingDirectory);

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_config.ReleasePollingIntervalSeconds));

        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            try
            {
                _logger.LogDebug("Polling for release pickups...");
                var pickups = await _apiClient.GetPendingReleasePickupsAsync(cancellationToken);

                _logger.LogDebug("Found {Count} pending release pickups", pickups.Count);

                foreach (var pickup in pickups)
                {
                    _logger.LogInformation("Found release pickup: {ReleaseName} #{ReleaseNumber}",
                        pickup.ReleaseName, pickup.ReleaseNumber);
                    // Fire and forget - execute in background
                    _ = ExecuteReleaseAsync(pickup, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to poll release pickups");
            }
        }
    }

    private async Task ExecuteReleaseAsync(ReleasePickupInfo pickup, CancellationToken cancellationToken)
    {
        // Wait for available slot
        await _semaphore.WaitAsync(cancellationToken);

        try
        {
            _logger.LogInformation("Executing release {ReleaseName} #{ReleaseNumber} for environment {Environment}",
                pickup.ReleaseName, pickup.ReleaseNumber, pickup.EnvironmentName);

            // Acknowledge pickup
            await _apiClient.AcknowledgeReleasePickupAsync(pickup.PickupId, cancellationToken);
            await _apiClient.StreamReleaseLogAsync(pickup.PickupId,
                $"[{DateTime.Now:HH:mm:ss}] Agent acknowledged release pickup", "info", cancellationToken);

            // Start execution
            await _apiClient.StartReleasePickupAsync(pickup.PickupId, cancellationToken);
            await _apiClient.StreamReleaseLogAsync(pickup.PickupId,
                $"[{DateTime.Now:HH:mm:ss}] Starting release execution for {pickup.ReleaseName} #{pickup.ReleaseNumber}", "info", cancellationToken);

            // Check if there are pipeline steps to execute
            if (pickup.Steps == null || pickup.Steps.Count == 0)
            {
                await _apiClient.StreamReleaseLogAsync(pickup.PickupId,
                    $"[{DateTime.Now:HH:mm:ss}] No pipeline steps found for this release", "warning", cancellationToken);
                await _apiClient.CompleteReleasePickupAsync(pickup.PickupId, true, null, cancellationToken);
                return;
            }

            // Execute each step in order
            var allStepsSucceeded = true;
            var errorMessage = string.Empty;

            foreach (var step in pickup.Steps.OrderBy(s => s.OrderIndex))
            {
                await _apiClient.StreamReleaseLogAsync(pickup.PickupId,
                    $"[{DateTime.Now:HH:mm:ss}] ===== Executing Step: {step.Name} =====", "info", cancellationToken);

                try
                {
                    var stepSuccess = await ExecuteStepAsync(pickup, step, cancellationToken);

                    if (!stepSuccess)
                    {
                        allStepsSucceeded = false;
                        errorMessage = $"Step '{step.Name}' failed";
                        await _apiClient.StreamReleaseLogAsync(pickup.PickupId,
                            $"[{DateTime.Now:HH:mm:ss}] Step '{step.Name}' failed. Stopping release execution.", "error", cancellationToken);
                        break;
                    }

                    await _apiClient.StreamReleaseLogAsync(pickup.PickupId,
                        $"[{DateTime.Now:HH:mm:ss}] Step '{step.Name}' completed successfully", "success", cancellationToken);
                }
                catch (Exception ex)
                {
                    allStepsSucceeded = false;
                    errorMessage = $"Step '{step.Name}' threw exception: {ex.Message}";
                    _logger.LogError(ex, "Failed to execute step {StepName} for pickup {PickupId}", step.Name, pickup.PickupId);
                    await _apiClient.StreamReleaseLogAsync(pickup.PickupId,
                        $"[{DateTime.Now:HH:mm:ss}] ERROR: {ex.Message}", "error", cancellationToken);
                    break;
                }
            }

            // Complete the release
            if (allStepsSucceeded)
            {
                await _apiClient.StreamReleaseLogAsync(pickup.PickupId,
                    $"[{DateTime.Now:HH:mm:ss}] ===== Release execution completed successfully =====", "success", cancellationToken);
                await _apiClient.CompleteReleasePickupAsync(pickup.PickupId, true, null, cancellationToken);
            }
            else
            {
                await _apiClient.StreamReleaseLogAsync(pickup.PickupId,
                    $"[{DateTime.Now:HH:mm:ss}] ===== Release execution failed =====", "error", cancellationToken);
                await _apiClient.CompleteReleasePickupAsync(pickup.PickupId, false, errorMessage, cancellationToken);
            }

            _logger.LogInformation("Release {ReleaseName} #{ReleaseNumber} completed with result: {Success}",
                pickup.ReleaseName, pickup.ReleaseNumber, allStepsSucceeded ? "Success" : "Failed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute release pickup {PickupId}", pickup.PickupId);
            await _apiClient.CompleteReleasePickupAsync(pickup.PickupId, false, $"Unexpected error: {ex.Message}", cancellationToken);
        }
        finally
        {
            _semaphore.Release();
        }
    }

    private async Task<bool> ExecuteStepAsync(ReleasePickupInfo pickup, PipelineStep step, CancellationToken cancellationToken)
    {
        // Create a temporary script file
        var scriptExtension = GetScriptExtension(step.Type);
        var scriptFileName = $"release_{pickup.ReleaseExecutionId}_step_{step.OrderIndex}{scriptExtension}";
        var scriptPath = Path.Combine(_config.WorkingDirectory, scriptFileName);

        try
        {
            // Write script content to file
            await File.WriteAllTextAsync(scriptPath, step.ScriptContent, cancellationToken);
            await _apiClient.StreamReleaseLogAsync(pickup.PickupId,
                $"[{DateTime.Now:HH:mm:ss}] Created script file: {scriptFileName}", "info", cancellationToken);

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

            // Add parameters as environment variables
            if (pickup.Parameters != null)
            {
                foreach (var (key, value) in pickup.Parameters)
                {
                    processInfo.EnvironmentVariables[$"PARAM_{key}"] = value;
                }
            }

            // Add release metadata as environment variables
            processInfo.EnvironmentVariables["RELEASE_NAME"] = pickup.ReleaseName;
            processInfo.EnvironmentVariables["RELEASE_NUMBER"] = pickup.ReleaseNumber;
            processInfo.EnvironmentVariables["ENVIRONMENT_NAME"] = pickup.EnvironmentName;
            processInfo.EnvironmentVariables["STEP_NAME"] = step.Name;

            using var process = new Process { StartInfo = processInfo };

            // Handle output
            process.OutputDataReceived += async (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    _logger.LogInformation("[Release {PickupId}] {Output}", pickup.PickupId, e.Data);
                    await _apiClient.StreamReleaseLogAsync(pickup.PickupId, e.Data, "info", cancellationToken);
                }
            };

            process.ErrorDataReceived += async (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    _logger.LogError("[Release {PickupId}] {Error}", pickup.PickupId, e.Data);
                    await _apiClient.StreamReleaseLogAsync(pickup.PickupId, $"ERROR: {e.Data}", "error", cancellationToken);
                }
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            // Wait with timeout
            var timeout = TimeSpan.FromSeconds(_config.ScriptTimeoutSeconds);

            try
            {
                await process.WaitForExitAsync(cancellationToken).WaitAsync(timeout, cancellationToken);
            }
            catch (TimeoutException)
            {
                _logger.LogWarning("Release step {StepName} timed out after {Timeout}s, killing process",
                    step.Name, timeout.TotalSeconds);
                process.Kill(true);
                await _apiClient.StreamReleaseLogAsync(pickup.PickupId,
                    $"[{DateTime.Now:HH:mm:ss}] Step timed out after {timeout.TotalSeconds}s", "error", cancellationToken);
                return false;
            }

            var success = process.ExitCode == 0;
            if (!success)
            {
                await _apiClient.StreamReleaseLogAsync(pickup.PickupId,
                    $"[{DateTime.Now:HH:mm:ss}] Step exited with code {process.ExitCode}", "error", cancellationToken);
            }

            return success;
        }
        finally
        {
            // Clean up script file
            try
            {
                if (File.Exists(scriptPath))
                {
                    File.Delete(scriptPath);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete script file {ScriptPath}", scriptPath);
            }
        }
    }

    private string GetScriptExtension(string stepType)
    {
        return stepType.ToLowerInvariant() switch
        {
            "powershell" => ".ps1",
            "bash" => ".sh",
            "python" => ".py",
            "batch" => ".bat",
            _ => ".sh"
        };
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
