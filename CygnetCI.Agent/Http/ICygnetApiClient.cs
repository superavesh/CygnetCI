using CygnetCI.Agent.Models;

namespace CygnetCI.Agent.Http;

public interface ICygnetApiClient
{
    Task RegisterAgentAsync(CancellationToken cancellationToken = default);
    Task SendHeartbeatAsync(SystemMetrics metrics, CancellationToken cancellationToken = default);
    Task SendMonitoringDataAsync(MonitoringData data, CancellationToken cancellationToken = default);
    Task<List<TaskInfo>> GetPendingTasksAsync(CancellationToken cancellationToken = default);
    Task StreamLogAsync(int taskId, string logLine, CancellationToken cancellationToken = default);
    Task CompleteTaskAsync(int taskId, bool success, int exitCode, CancellationToken cancellationToken = default);
    Task<List<TransferFilePickup>> GetPendingDownloadsAsync(CancellationToken cancellationToken = default);
    Task<byte[]> DownloadFileAsync(int pickupId, CancellationToken cancellationToken = default);
    Task AcknowledgeDownloadAsync(int pickupId, bool success, CancellationToken cancellationToken = default);
    Task<List<ReleasePickupInfo>> GetPendingReleasePickupsAsync(CancellationToken cancellationToken = default);
    Task AcknowledgeReleasePickupAsync(int pickupId, CancellationToken cancellationToken = default);
    Task StartReleasePickupAsync(int pickupId, CancellationToken cancellationToken = default);
    Task StreamReleaseLogAsync(int pickupId, string logLine, string logLevel = "info", CancellationToken cancellationToken = default);
    Task CompleteReleasePickupAsync(int pickupId, bool success, string? errorMessage = null, CancellationToken cancellationToken = default);
    Task<List<PipelinePickupInfo>> GetPendingPipelinePickupsAsync(CancellationToken cancellationToken = default);
    Task AcknowledgePipelinePickupAsync(int pickupId, CancellationToken cancellationToken = default);
    Task StartPipelinePickupAsync(int pickupId, CancellationToken cancellationToken = default);
    Task StreamPipelineLogAsync(int pickupId, string logLine, string logLevel = "info", string? stepName = null, CancellationToken cancellationToken = default);
    Task CompletePipelinePickupAsync(int pickupId, bool success, string? errorMessage = null, CancellationToken cancellationToken = default);
}
