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
            var errorMessage = string.Empty;

            foreach (var step in pickup.Steps.OrderBy(s => s.OrderIndex))
            {
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"", "info", step.Name, cancellationToken);
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"===== Executing Step: {step.Name} =====", "info", step.Name, cancellationToken);

                try
                {
                    var stepSuccess = await ExecuteStepAsync(pickup, step, cancellationToken);

                    if (!stepSuccess)
                    {
                        if (step.ContinueOnError)
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

            // Complete the pipeline
            if (allStepsSucceeded)
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

            _logger.LogInformation("Pipeline {PipelineName} completed with result: {Success}",
                pickup.PipelineName, allStepsSucceeded ? "Success" : "Failed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute pipeline pickup {PickupId}", pickup.PickupId);
            await _apiClient.CompletePipelinePickupAsync(pickup.PickupId, false, $"Unexpected error: {ex.Message}", cancellationToken);
        }
        finally
        {
            _semaphore.Release();
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
                "cmd" or _ => await ExecuteProcessAsync(pickup, step, command, "cmd.exe", $"/c {command}", cancellationToken)
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

            // Execute with timeout
            var timeout = TimeSpan.FromSeconds(_config.ScriptTimeoutSeconds);
            var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(timeout);

            var invokeTask = Task.Run(() =>
            {
                var results = powerShell.Invoke();
                return results;
            }, cts.Token);

            try
            {
                var results = await invokeTask;

                // Stream output
                foreach (var result in results)
                {
                    if (result != null)
                    {
                        var output = result.ToString();
                        _logger.LogInformation("[Pipeline {PickupId}] {Output}", pickup.PickupId, output);
                        await _apiClient.StreamPipelineLogAsync(pickup.PickupId, output, "info", step.Name, cancellationToken);
                    }
                }

                // Stream errors
                if (powerShell.Streams.Error.Count > 0)
                {
                    foreach (var error in powerShell.Streams.Error)
                    {
                        var errorMessage = error.ToString();
                        _logger.LogError("[Pipeline {PickupId}] {Error}", pickup.PickupId, errorMessage);
                        await _apiClient.StreamPipelineLogAsync(pickup.PickupId, errorMessage, "error", step.Name, cancellationToken);
                    }
                    return false;
                }

                return powerShell.HadErrors == false;
            }
            catch (OperationCanceledException)
            {
                powerShell.Stop();
                _logger.LogWarning("PowerShell step {StepName} timed out after {Timeout}s",
                    step.Name, timeout.TotalSeconds);
                await _apiClient.StreamPipelineLogAsync(pickup.PickupId,
                    $"Step timed out after {timeout.TotalSeconds}s", "error", step.Name, cancellationToken);
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

            // Handle output
            process.OutputDataReceived += async (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    _logger.LogInformation("[Pipeline {PickupId}] {Output}", pickup.PickupId, e.Data);
                    await _apiClient.StreamPipelineLogAsync(pickup.PickupId, e.Data, "info", step.Name, cancellationToken);
                }
            };

            process.ErrorDataReceived += async (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    _logger.LogError("[Pipeline {PickupId}] {Error}", pickup.PickupId, e.Data);
                    await _apiClient.StreamPipelineLogAsync(pickup.PickupId, e.Data, "error", step.Name, cancellationToken);
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
                _logger.LogWarning("Pipeline step {StepName} timed out after {Timeout}s, killing process",
                    step.Name, timeout.TotalSeconds);
                process.Kill(true);
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
