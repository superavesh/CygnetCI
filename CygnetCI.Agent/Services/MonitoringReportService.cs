using CygnetCI.Agent.Http;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Services;

public class MonitoringReportService : IMonitoringReportService
{
    private readonly ILogger<MonitoringReportService> _logger;
    private readonly ICygnetApiClient _apiClient;
    private readonly IMonitoringDataCollector _collector;
    private readonly AgentConfiguration _config;

    public MonitoringReportService(
        ILogger<MonitoringReportService> logger,
        ICygnetApiClient apiClient,
        IMonitoringDataCollector collector,
        IOptions<AgentConfiguration> config)
    {
        _logger = logger;
        _apiClient = apiClient;
        _collector = collector;
        _config = config.Value;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var interval = _config.MonitoringIntervalSeconds > 0
            ? _config.MonitoringIntervalSeconds
            : 60; // Default to 60 seconds

        _logger.LogInformation("Monitoring report service starting with interval: {Interval}s", interval);

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(interval));

        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            try
            {
                var monitoringData = _collector.CollectMonitoringData();
                await _apiClient.SendMonitoringDataAsync(monitoringData, cancellationToken);

                _logger.LogDebug("Monitoring data reported: {ServiceCount} services, {DriveCount} drives, {PingCount} pings",
                    monitoringData.WindowsServices.Count,
                    monitoringData.Drives.Count,
                    monitoringData.WebsitePings.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to report monitoring data");
            }
        }
    }
}
