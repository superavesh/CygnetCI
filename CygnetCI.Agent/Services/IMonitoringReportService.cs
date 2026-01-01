namespace CygnetCI.Agent.Services;

public interface IMonitoringReportService
{
    Task StartAsync(CancellationToken cancellationToken);
}
