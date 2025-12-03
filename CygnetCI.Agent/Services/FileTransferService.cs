using CygnetCI.Agent.Http;
using CygnetCI.Agent.Models;
using CygnetCI.Agent.Utilities;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Services;

public class FileTransferService : IFileTransferService
{
    private readonly ILogger<FileTransferService> _logger;
    private readonly ICygnetApiClient _apiClient;
    private readonly AgentConfiguration _config;

    public FileTransferService(
        ILogger<FileTransferService> logger,
        ICygnetApiClient apiClient,
        IOptions<AgentConfiguration> config)
    {
        _logger = logger;
        _apiClient = apiClient;
        _config = config.Value;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("File transfer service starting with polling interval: {Interval}s",
            _config.FilePollingIntervalSeconds);

        // Ensure downloads directory exists
        Directory.CreateDirectory(_config.DownloadsDirectory);

        _logger.LogInformation("Starting file transfer polling loop...");

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_config.FilePollingIntervalSeconds));

        _logger.LogInformation("Waiting for first timer tick...");

        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            try
            {
                _logger.LogDebug("Polling for pending file downloads...");
                var pickups = await _apiClient.GetPendingDownloadsAsync(cancellationToken);

                _logger.LogDebug("Found {Count} pending file downloads", pickups.Count);

                foreach (var pickup in pickups)
                {
                    _logger.LogInformation("Found file download: {FileName} (Type: {FileType}, Version: {Version})",
                        pickup.FileName, pickup.FileType, pickup.Version);
                    await DownloadFileAsync(pickup, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to poll file transfers");
            }
        }
    }

    private async Task DownloadFileAsync(TransferFilePickup pickup, CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Downloading file: {FileName} (Type: {FileType}, Version: {Version})",
                pickup.FileName, pickup.FileType, pickup.Version);

            // Download file
            var fileBytes = await _apiClient.DownloadFileAsync(pickup.Id, cancellationToken);

            // Create directory structure: downloads/{file_type}s/{version}/
            var fileDirectory = Path.Combine(
                _config.DownloadsDirectory,
                $"{pickup.FileType}s",
                pickup.Version);

            Directory.CreateDirectory(fileDirectory);

            var filePath = Path.Combine(fileDirectory, pickup.FileName);

            // Write file
            await File.WriteAllBytesAsync(filePath, fileBytes, cancellationToken);

            _logger.LogInformation("File saved to: {FilePath} ({Size} bytes)",
                filePath, fileBytes.Length);

            // Verify checksum if provided
            if (!string.IsNullOrEmpty(pickup.Checksum))
            {
                if (!ChecksumValidator.ValidateChecksum(filePath, pickup.Checksum))
                {
                    _logger.LogError("Checksum verification failed for file: {FileName}", pickup.FileName);
                    File.Delete(filePath);
                    await _apiClient.AcknowledgeDownloadAsync(pickup.Id, false, cancellationToken);
                    return;
                }

                _logger.LogInformation("Checksum verified successfully for file: {FileName}", pickup.FileName);
            }

            // Acknowledge successful download
            await _apiClient.AcknowledgeDownloadAsync(pickup.Id, true, cancellationToken);

            _logger.LogInformation("File downloaded and acknowledged: {FileName}", pickup.FileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download file {FileName}", pickup.FileName);

            try
            {
                await _apiClient.AcknowledgeDownloadAsync(pickup.Id, false, cancellationToken);
            }
            catch (Exception ackEx)
            {
                _logger.LogError(ackEx, "Failed to acknowledge download failure");
            }
        }
    }
}
