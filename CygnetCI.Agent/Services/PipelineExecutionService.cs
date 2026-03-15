using System.Diagnostics;
using System.Management.Automation;
using System.Management.Automation.Runspaces;
using System.Text;
using System.Text.RegularExpressions;
using CygnetCI.Agent.Http;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Services;

public class PipelineExecutionService : IPipelineExecutionService
{
    private readonly ILogger<PipelineExecutionService> _logger;
    private readonly ICygnetApiClient _apiClient;
    private readonly AgentConfiguration _config;
    private readonly SemaphoreSlim _semaphore;

    public PipelineExecutionService(
        ILogger<PipelineExecutionService> logger,
        ICygnetApiClient apiClient,
        IOptions<AgentConfiguration> config)
    {
        _logger = logger;
        _apiClient = apiClient;
        _config = config.Value;
        _semaphore = new SemaphoreSlim(config.Value.MaxConcurrentPipelines);
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Pipeline execution service starting with polling interval: {Interval}s",
            _config.PipelinePollingIntervalSeconds);

        // Ensure working directory exists
        Directory.CreateDirectory(_config.WorkingDirectory);

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_config.PipelinePollingIntervalSeconds));

        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            try
            {
                _logger.LogDebug("Polling for pipeline pickups...");
                var pickups = await _apiClient.GetPendingPipelinePickupsAsync(cancellationToken);

                _logger.LogDebug("Found {Count} pending pipeline pickups", pickups.Count);

                foreach (var pickup in pickups)
                {
                    _logger.LogInformation("Found pipeline pickup: {PipelineName}",
                        pickup.PipelineName);
                    // Fire and forget - execute in background
                    _ = ExecutePipelineAsync(pickup, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to poll pipeline pickups");
            }
        }
    }

    private async Task ExecutePipelineAsync(PipelinePickupInfo pickup, CancellationToken cancellationToken)
    {
        // Wait for available slot
        await _semaphore.WaitAsync(cancellationToken);

        // Create a linked CTS so we can cancel this specific pipeline execution
        using var pipelineCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var pipelineToken = pipelineCts.Token;

        // Start background cancellation polling task
        var cancellationPollTask = PollForCancellationAsync(pickup.PickupId, pipelineCts, cancellationToken);

        try
        {
            _logger.LogInformation("Executing pipeline {PipelineName} (Execution ID: {ExecutionId})",
                pickup.PipelineName, pickup.PipelineExecutionId);

            // Acknowledge pickup
            await _apiClient.AcknowledgePipelinePickupAsync(pickup.PickupId, cancellationToken);
            await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                $"Agent acknowledged pipeline pickup", "info", null, cancellationToken);

            // Start execution
            await _apiClient.StartPipelinePickupAsync(pickup.PickupId, cancellationToken);
            await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                $"Starting pipeline execution: {pickup.PipelineName}", "info", null, cancellationToken);

            // Check if there are steps to execute
            if (pickup.Steps == null || pickup.Steps.Count == 0)
            {
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"No steps found for this pipeline", "warning", null, cancellationToken);
                await _apiClient.CompletePipelinePickupAsync(pickup.PickupId, true, null, cancellationToken);
                return;
            }

            // Execute each step in order
            var allStepsSucceeded = true;
            var wasCancelled = false;
            var errorMessage = string.Empty;

            foreach (var step in pickup.Steps.OrderBy(s => s.OrderIndex))
            {
                // Check if cancelled before starting next step
                if (pipelineToken.IsCancellationRequested)
                {
                    wasCancelled = true;
                    _logger.LogInformation("Pipeline {PipelineName} was cancelled by user before step '{StepName}'",
                        pickup.PipelineName, step.Name);
                    await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                        $"Pipeline cancelled by user before step '{step.Name}'", "warning", step.Name, cancellationToken);
                    break;
                }

                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"", "info", step.Name, pipelineToken);
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"===== Executing Step: {step.Name} =====", "info", step.Name, pipelineToken);

                try
                {
                    var stepSuccess = await ExecuteStepAsync(pickup, step, pipelineToken);

                    if (!stepSuccess)
                    {
                        if (pipelineToken.IsCancellationRequested)
                        {
                            wasCancelled = true;
                            _logger.LogInformation("Pipeline {PipelineName} was cancelled by user during step '{StepName}'",
                                pickup.PipelineName, step.Name);
                            await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                                $"Pipeline cancelled by user during step '{step.Name}'", "warning", step.Name, cancellationToken);
                            break;
                        }
                        else if (step.ContinueOnError)
                        {
                            await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                                $"Step '{step.Name}' failed but continuing (continue_on_error=true)", "warning", step.Name, cancellationToken);
                        }
                        else
                        {
                            allStepsSucceeded = false;
                            errorMessage = $"Step '{step.Name}' failed";
                            await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                                $"Step '{step.Name}' failed. Stopping pipeline execution.", "error", step.Name, cancellationToken);
                            break;
                        }
                    }
                    else
                    {
                        await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                            $"Step '{step.Name}' completed successfully", "success", step.Name, cancellationToken);
                    }
                }
                catch (OperationCanceledException) when (pipelineToken.IsCancellationRequested)
                {
                    wasCancelled = true;
                    _logger.LogInformation("Pipeline {PipelineName} was cancelled by user during step '{StepName}'",
                        pickup.PipelineName, step.Name);
                    await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                        $"Pipeline cancelled by user during step '{step.Name}'", "warning", step.Name, cancellationToken);
                    break;
                }
                catch (Exception ex)
                {
                    if (step.ContinueOnError)
                    {
                        await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                            $"Step '{step.Name}' threw exception but continuing: {ex.Message}", "warning", step.Name, cancellationToken);
                    }
                    else
                    {
                        allStepsSucceeded = false;
                        errorMessage = $"Step '{step.Name}' threw exception: {ex.Message}";
                        _logger.LogError(ex, "Failed to execute step {StepName} for pickup {PickupId}", step.Name, pickup.PickupId);
                        await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                            $"ERROR: {ex.Message}", "error", step.Name, cancellationToken);
                        break;
                    }
                }
            }

            // Complete the pipeline (use the original cancellationToken, not pipelineToken, to ensure we can report back)
            if (wasCancelled)
            {
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"", "warning", null, cancellationToken);
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"===== Pipeline execution cancelled by user =====", "warning", null, cancellationToken);
                await _apiClient.CompletePipelinePickupAsync(pickup.PickupId, false, "Cancelled by user", cancellationToken);

                _logger.LogInformation("Pipeline {PipelineName} was cancelled by user", pickup.PipelineName);
            }
            else if (allStepsSucceeded)
            {
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"", "success", null, cancellationToken);
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"===== Pipeline execution completed successfully =====", "success", null, cancellationToken);
                await _apiClient.CompletePipelinePickupAsync(pickup.PickupId, true, null, cancellationToken);
            }
            else
            {
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"", "error", null, cancellationToken);
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"===== Pipeline execution failed =====", "error", null, cancellationToken);
                await _apiClient.CompletePipelinePickupAsync(pickup.PickupId, false, errorMessage, cancellationToken);
            }

            _logger.LogInformation("Pipeline {PipelineName} completed with result: {Result}",
                pickup.PipelineName, wasCancelled ? "Cancelled" : allStepsSucceeded ? "Success" : "Failed");
        }
        catch (OperationCanceledException) when (pipelineToken.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
        {
            // Pipeline was cancelled by user (not by service shutdown)
            _logger.LogInformation("Pipeline {PipelineName} cancelled by user", pickup.PipelineName);
            await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                $"===== Pipeline execution cancelled by user =====", "warning", null, cancellationToken);
            await _apiClient.CompletePipelinePickupAsync(pickup.PickupId, false, "Cancelled by user", cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute pipeline pickup {PickupId}", pickup.PickupId);
            await _apiClient.CompletePipelinePickupAsync(pickup.PickupId, false, $"Unexpected error: {ex.Message}", cancellationToken);
        }
        finally
        {
            // Cancel the polling task
            await pipelineCts.CancelAsync();
            _semaphore.Release();
        }
    }

    /// <summary>
    /// Background task that polls the API to check if the pipeline pickup has been cancelled.
    /// When cancelled is detected, it cancels the CancellationTokenSource to stop the running process.
    /// </summary>
    private async Task PollForCancellationAsync(int pickupId, CancellationTokenSource pipelineCts, CancellationToken serviceCancellationToken)
    {
        try
        {
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(3));

            while (await timer.WaitForNextTickAsync(serviceCancellationToken))
            {
                if (pipelineCts.IsCancellationRequested)
                    break;

                var status = await _apiClient.CheckPipelinePickupStatusAsync(pickupId, serviceCancellationToken);

                if (status == "cancelled")
                {
                    _logger.LogInformation("Pipeline pickup {PickupId} has been cancelled by user, triggering cancellation", pickupId);
                    await pipelineCts.CancelAsync();
                    break;
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Expected when pipeline completes or service shuts down
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in cancellation polling for pickup {PickupId}", pickupId);
        }
    }

    private async Task<bool> ExecuteStepAsync(PipelinePickupInfo pickup, PipelineStepInfo step, CancellationToken cancellationToken)
    {
        try
        {
            // Substitute parameters in command
            var command = SubstituteParameters(step.Command, pickup.Parameters);

            await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                $"Executing command using {step.ShellType}: {command}", "debug", step.Name, cancellationToken);

            // Execute based on shell type
            return step.ShellType.ToLowerInvariant() switch
            {
                "powershell" => await ExecutePowerShellAsync(pickup, step, command, cancellationToken),
                "bash" => await ExecuteProcessAsync(pickup, step, command, "/bin/bash", $"-c \"{command.Replace("\"", "\\\"")}\"", cancellationToken),
                "cmd" or _ => OperatingSystem.IsLinux()
                    ? await ExecuteProcessAsync(pickup, step, command, "/bin/bash", $"-c \"{command.Replace("\"", "\\\"")}\"", cancellationToken)
                    : await ExecuteProcessAsync(pickup, step, command, "cmd.exe", $"/c {command}", cancellationToken)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute step command");
            await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                $"Failed to execute command: {ex.Message}", "error", step.Name, cancellationToken);
            return false;
        }
    }

    private async Task<bool> ExecutePowerShellAsync(PipelinePickupInfo pickup, PipelineStepInfo step, string command, CancellationToken cancellationToken)
    {
        try
        {
            // Create default session state with all built-in modules
            var iss = InitialSessionState.CreateDefault();
            using var powerShell = PowerShell.Create(iss);

            // Set working directory
            powerShell.AddScript($"Set-Location -Path '{_config.WorkingDirectory}'");

            // Add parameters as PowerShell variables
            if (pickup.Parameters != null)
            {
                foreach (var (key, value) in pickup.Parameters)
                {
                    powerShell.AddScript($"$env:{key} = '{value}'");
                    powerShell.AddScript($"$env:PARAM_{key} = '{value}'");
                    powerShell.AddScript($"${key} = '{value}'");
                }
            }

            // Add pipeline metadata as environment variables
            powerShell.AddScript($"$env:PIPELINE_NAME = '{pickup.PipelineName}'");
            powerShell.AddScript($"$env:PIPELINE_ID = '{pickup.PipelineId}'");
            powerShell.AddScript($"$env:EXECUTION_ID = '{pickup.PipelineExecutionId}'");
            powerShell.AddScript($"$env:STEP_NAME = '{step.Name}'");

            // Add the actual command
            powerShell.AddScript(command);

            // Use a concurrent queue to collect output in real-time from event handlers
            var logQueue = new System.Collections.Concurrent.ConcurrentQueue<(string message, string level)>();

            // Create output collection that streams data as it arrives
            var outputCollection = new PSDataCollection<PSObject>();
            outputCollection.DataAdded += (sender, e) =>
            {
                if (sender is PSDataCollection<PSObject> collection)
                {
                    var output = collection[e.Index]?.ToString();
                    if (!string.IsNullOrEmpty(output))
                    {
                        _logger.LogInformation("[Pipeline {PickupId}] {Output}", pickup.PickupId, output);
                        logQueue.Enqueue((output, "info"));
                    }
                }
            };

            // Subscribe to streams for real-time output
            powerShell.Streams.Information.DataAdded += (sender, e) =>
            {
                if (sender is PSDataCollection<InformationRecord> collection)
                {
                    var msg = collection[e.Index]?.MessageData?.ToString();
                    if (!string.IsNullOrEmpty(msg))
                    {
                        _logger.LogInformation("[Pipeline {PickupId}] {Output}", pickup.PickupId, msg);
                        logQueue.Enqueue((msg, "info"));
                    }
                }
            };

            powerShell.Streams.Warning.DataAdded += (sender, e) =>
            {
                if (sender is PSDataCollection<WarningRecord> collection)
                {
                    var msg = collection[e.Index]?.Message;
                    if (!string.IsNullOrEmpty(msg))
                    {
                        _logger.LogWarning("[Pipeline {PickupId}] {Warning}", pickup.PickupId, msg);
                        logQueue.Enqueue(($"WARNING: {msg}", "warning"));
                    }
                }
            };

            powerShell.Streams.Error.DataAdded += (sender, e) =>
            {
                if (sender is PSDataCollection<ErrorRecord> collection)
                {
                    var msg = collection[e.Index]?.ToString();
                    if (!string.IsNullOrEmpty(msg))
                    {
                        _logger.LogError("[Pipeline {PickupId}] {Error}", pickup.PickupId, msg);
                        logQueue.Enqueue((msg, "error"));
                    }
                }
            };

            powerShell.Streams.Verbose.DataAdded += (sender, e) =>
            {
                if (sender is PSDataCollection<VerboseRecord> collection)
                {
                    var msg = collection[e.Index]?.Message;
                    if (!string.IsNullOrEmpty(msg))
                    {
                        _logger.LogDebug("[Pipeline {PickupId}] VERBOSE: {Output}", pickup.PickupId, msg);
                        logQueue.Enqueue(($"VERBOSE: {msg}", "debug"));
                    }
                }
            };

            powerShell.Streams.Debug.DataAdded += (sender, e) =>
            {
                if (sender is PSDataCollection<DebugRecord> collection)
                {
                    var msg = collection[e.Index]?.Message;
                    if (!string.IsNullOrEmpty(msg))
                    {
                        _logger.LogDebug("[Pipeline {PickupId}] DEBUG: {Output}", pickup.PickupId, msg);
                        logQueue.Enqueue(($"DEBUG: {msg}", "debug"));
                    }
                }
            };

            // Execute with timeout using BeginInvoke for real-time streaming
            var timeout = TimeSpan.FromSeconds(_config.ScriptTimeoutSeconds);
            var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(timeout);

            var inputCollection = new PSDataCollection<PSObject>();
            inputCollection.Complete();

            var asyncResult = powerShell.BeginInvoke(inputCollection, outputCollection);

            // Drain the log queue while the script is running
            try
            {
                while (!asyncResult.IsCompleted)
                {
                    // Flush any queued logs to the API
                    while (logQueue.TryDequeue(out var logEntry))
                    {
                        await _apiClient.StreamPipelineLogAsync(pickup.PickupId, logEntry.message, logEntry.level, step.Name, cancellationToken);
                    }

                    // Check for cancellation
                    if (cts.Token.IsCancellationRequested)
                    {
                        powerShell.Stop();
                        throw new OperationCanceledException(cts.Token);
                    }

                    await Task.Delay(200, cts.Token);
                }

                // Script finished — flush remaining logs
                powerShell.EndInvoke(asyncResult);

                while (logQueue.TryDequeue(out var logEntry))
                {
                    await _apiClient.StreamPipelineLogAsync(pickup.PickupId, logEntry.message, logEntry.level, step.Name, cancellationToken);
                }

                return powerShell.HadErrors == false && powerShell.Streams.Error.Count == 0;
            }
            catch (OperationCanceledException)
            {
                powerShell.Stop();
                _logger.LogWarning("PowerShell step {StepName} timed out or was cancelled after {Timeout}s",
                    step.Name, timeout.TotalSeconds);
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"Step timed out or was cancelled after {timeout.TotalSeconds}s", "error", step.Name, cancellationToken);
                return false;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute PowerShell command");
            await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                $"PowerShell execution failed: {ex.Message}", "error", step.Name, cancellationToken);
            return false;
        }
    }

    private async Task<bool> ExecuteProcessAsync(PipelinePickupInfo pickup, PipelineStepInfo step, string command,
        string fileName, string arguments, CancellationToken cancellationToken)
    {
        try
        {
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
                    processInfo.EnvironmentVariables[key] = value;
                    processInfo.EnvironmentVariables[$"PARAM_{key}"] = value;
                }
            }

            // Add pipeline metadata as environment variables
            processInfo.EnvironmentVariables["PIPELINE_NAME"] = pickup.PipelineName;
            processInfo.EnvironmentVariables["PIPELINE_ID"] = pickup.PipelineId.ToString();
            processInfo.EnvironmentVariables["EXECUTION_ID"] = pickup.PipelineExecutionId.ToString();
            processInfo.EnvironmentVariables["STEP_NAME"] = step.Name;

            using var process = new Process { StartInfo = processInfo };

            // Use a concurrent queue to collect output from event handlers (avoids async void)
            var logQueue = new System.Collections.Concurrent.ConcurrentQueue<(string message, string level)>();

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    _logger.LogInformation("[Pipeline {PickupId}] {Output}", pickup.PickupId, e.Data);
                    logQueue.Enqueue((e.Data, "info"));
                }
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    _logger.LogError("[Pipeline {PickupId}] {Error}", pickup.PickupId, e.Data);
                    logQueue.Enqueue((e.Data, "error"));
                }
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            // Wait with timeout, draining the log queue in real-time
            var timeout = TimeSpan.FromSeconds(_config.ScriptTimeoutSeconds);
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(timeout);

            try
            {
                // Drain log queue while process is running
                while (!process.HasExited)
                {
                    // Flush queued logs to the API
                    while (logQueue.TryDequeue(out var logEntry))
                    {
                        await _apiClient.StreamPipelineLogAsync(pickup.PickupId, logEntry.message, logEntry.level, step.Name, cancellationToken);
                    }

                    // Check for cancellation or timeout
                    if (timeoutCts.Token.IsCancellationRequested)
                    {
                        process.Kill(true);
                        if (cancellationToken.IsCancellationRequested)
                            throw new OperationCanceledException(cancellationToken);
                        // Timeout
                        _logger.LogWarning("Pipeline step {StepName} timed out after {Timeout}s, killing process",
                            step.Name, timeout.TotalSeconds);
                        await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                            $"Step timed out after {timeout.TotalSeconds}s", "error", step.Name, cancellationToken);
                        return false;
                    }

                    await Task.Delay(200, timeoutCts.Token);
                }

                // Process exited — wait briefly for any final output events to fire
                await Task.Delay(300);

                // Flush remaining queued logs
                while (logQueue.TryDequeue(out var logEntry))
                {
                    await _apiClient.StreamPipelineLogAsync(pickup.PickupId, logEntry.message, logEntry.level, step.Name, cancellationToken);
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                process.Kill(true);
                throw;
            }
            catch (OperationCanceledException)
            {
                // Timeout from timeoutCts
                process.Kill(true);
                _logger.LogWarning("Pipeline step {StepName} timed out after {Timeout}s, killing process",
                    step.Name, timeout.TotalSeconds);
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"Step timed out after {timeout.TotalSeconds}s", "error", step.Name, cancellationToken);
                return false;
            }

            var success = process.ExitCode == 0;
            if (!success)
            {
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"Step exited with code {process.ExitCode}", "error", step.Name, cancellationToken);
            }

            return success;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute process command");
            await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                $"Process execution failed: {ex.Message}", "error", step.Name, cancellationToken);
            return false;
        }
    }

    private string SubstituteParameters(string command, Dictionary<string, string> parameters)
    {
        if (string.IsNullOrEmpty(command) || parameters == null || parameters.Count == 0)
            return command;

        // Replace {{PARAM_NAME}} with actual parameter values
        var result = command;
        foreach (var (key, value) in parameters)
        {
            result = Regex.Replace(result, $@"{{\{{{Regex.Escape(key)}\}}}}", value, RegexOptions.IgnoreCase);
        }

        return result;
    }
}
