using CygnetCI.Agent.Http;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Services;

public class HeartbeatService : IHeartbeatService
{
    private readonly ILogger<HeartbeatService> _logger;
    private readonly ICygnetApiClient _apiClient;
    private readonly ISystemMonitorService _systemMonitor;
    private readonly AgentConfiguration _config;

    public HeartbeatService(
        ILogger<HeartbeatService> logger,
        ICygnetApiClient apiClient,
        ISystemMonitorService systemMonitor,
        IOptions<AgentConfiguration> config)
    {
        _logger = logger;
        _apiClient = apiClient;
        _systemMonitor = systemMonitor;
        _config = config.Value;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Heartbeat service starting with interval: {Interval}s", _config.HeartbeatIntervalSeconds);

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_config.HeartbeatIntervalSeconds));

        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            try
            {
                var metrics = _systemMonitor.GetSystemMetrics();
                await _apiClient.SendHeartbeatAsync(metrics, cancellationToken);

                _logger.LogDebug("Heartbeat sent: CPU={Cpu}%, Memory={Memory}%, Jobs={Jobs}",
                    metrics.CpuUsage, metrics.MemoryUsage, metrics.ActiveJobs);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send heartbeat");
            }
        }
    }
}
