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
    private readonly ICygnetApiClient _apiClient;

    public AgentWorker(
        ILogger<AgentWorker> logger,
        IHeartbeatService heartbeatService,
        IMonitoringReportService monitoringReportService,
        ITaskExecutionService taskExecutionService,
        IFileTransferService fileTransferService,
        IReleaseExecutionService releaseExecutionService,
        IPipelineExecutionService pipelineExecutionService,
        ICygnetApiClient apiClient)
    {
        _logger = logger;
        _heartbeatService = heartbeatService;
        _monitoringReportService = monitoringReportService;
        _taskExecutionService = taskExecutionService;
        _fileTransferService = fileTransferService;
        _releaseExecutionService = releaseExecutionService;
        _pipelineExecutionService = pipelineExecutionService;
        _apiClient = apiClient;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("CygnetCI Agent starting...");
        _logger.LogInformation("Machine: {Machine}, OS: {OS}", Environment.MachineName, Environment.OSVersion);

        try
        {
            // Register agent with server
            await _apiClient.RegisterAgentAsync(stoppingToken);
            _logger.LogInformation("Agent registered successfully");

            // Start all background services
            var tasks = new[]
            {
                _heartbeatService.StartAsync(stoppingToken),
                _monitoringReportService.StartAsync(stoppingToken),
                _taskExecutionService.StartAsync(stoppingToken),
                _fileTransferService.StartAsync(stoppingToken),
                _releaseExecutionService.StartAsync(stoppingToken),
                _pipelineExecutionService.StartAsync(stoppingToken)
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

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("CygnetCI Agent stopping...");
        await base.StopAsync(cancellationToken);
        _logger.LogInformation("CygnetCI Agent stopped");
    }
}
