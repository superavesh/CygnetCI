using CygnetCI.Agent.Http;
using CygnetCI.Agent.Services;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CygnetCI.Agent;

public class AgentWorker : BackgroundService
{
    private readonly ILogger<AgentWorker> _logger;
    private readonly IHeartbeatService _heartbeatService;
    private readonly IMonitoringReportService _monitoringReportService;
    private readonly ITaskExecutionService _taskExecutionService;
    private readonly IFileTransferService _fileTransferService;
    private readonly IReleaseExecutionService _releaseExecutionService;
    private readonly IPipelineExecutionService _pipelineExecutionService;
    private readonly ICommandExecutionService _commandExecutionService;
    private readonly ICygnetApiClient _apiClient;
    private readonly AgentIdentityService _agentIdentity;

    public AgentWorker(
        ILogger<AgentWorker> logger,
        IHeartbeatService heartbeatService,
        IMonitoringReportService monitoringReportService,
        ITaskExecutionService taskExecutionService,
        IFileTransferService fileTransferService,
        IReleaseExecutionService releaseExecutionService,
        IPipelineExecutionService pipelineExecutionService,
        ICommandExecutionService commandExecutionService,
        ICygnetApiClient apiClient,
        AgentIdentityService agentIdentity)
    {
        _logger = logger;
        _heartbeatService = heartbeatService;
        _monitoringReportService = monitoringReportService;
        _taskExecutionService = taskExecutionService;
        _fileTransferService = fileTransferService;
        _releaseExecutionService = releaseExecutionService;
        _pipelineExecutionService = pipelineExecutionService;
        _commandExecutionService = commandExecutionService;
        _apiClient = apiClient;
        _agentIdentity = agentIdentity;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("CygnetCI Agent starting...");
        _logger.LogInformation("Machine: {Machine}, OS: {OS}", Environment.MachineName, Environment.OSVersion);

        try
        {
            // Register with retry — transient errors (502, network) must not crash the host
            var (agentId, customerId) = await RegisterWithRetryAsync(stoppingToken);
            _agentIdentity.SetAgentId(agentId);
            _agentIdentity.SetCustomerId(customerId);
            _logger.LogInformation("Agent registered successfully with ID {AgentId}, CustomerId {CustomerId}", agentId, customerId);

            // Start all background services
            var tasks = new[]
            {
                _heartbeatService.StartAsync(stoppingToken),
                _monitoringReportService.StartAsync(stoppingToken),
                _taskExecutionService.StartAsync(stoppingToken),
                _fileTransferService.StartAsync(stoppingToken),
                _releaseExecutionService.StartAsync(stoppingToken),
                _pipelineExecutionService.StartAsync(stoppingToken),
                _commandExecutionService.StartAsync(stoppingToken)
            };

            _logger.LogInformation("All services started. Agent is now running.");

            await Task.WhenAll(tasks);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Agent shutdown requested");
        }
        catch (Exception ex)
        {
            _logger.LogCritical(ex, "Fatal error in agent execution");
            throw;
        }
    }

    /// <summary>
    /// Retries registration indefinitely with capped exponential backoff.
    /// The agent should never crash just because the API or parent proxy is temporarily unavailable.
    /// </summary>
    private async Task<(int agentId, int customerId)> RegisterWithRetryAsync(CancellationToken stoppingToken)
    {
        var delay = TimeSpan.FromSeconds(5);
        var attempt = 0;

        while (!stoppingToken.IsCancellationRequested)
        {
            attempt++;
            try
            {
                var result = await _apiClient.RegisterAgentAsync(stoppingToken);
                if (attempt > 1)
                    _logger.LogInformation("Registration succeeded on attempt {Attempt}", attempt);
                return result;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    "Registration attempt {Attempt} failed: {Message}. Retrying in {Delay}s...",
                    attempt, ex.Message, (int)delay.TotalSeconds);

                await Task.Delay(delay, stoppingToken);

                // Exponential backoff capped at 60 seconds
                delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, 60));
            }
        }

        throw new OperationCanceledException(stoppingToken);
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("CygnetCI Agent stopping...");
        await base.StopAsync(cancellationToken);
        _logger.LogInformation("CygnetCI Agent stopped");
    }
}
