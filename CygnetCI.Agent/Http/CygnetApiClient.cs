using System.Text;
using System.Text.Json;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Http;

public class CygnetApiClient : ICygnetApiClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<CygnetApiClient> _logger;
    private readonly AgentConfiguration _config;
    private readonly JsonSerializerOptions _jsonOptions;

    public CygnetApiClient(
        HttpClient httpClient,
        ILogger<CygnetApiClient> logger,
        IOptions<AgentConfiguration> config)
    {
        _httpClient = httpClient;
        _logger = logger;
        _config = config.Value;
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
        };
    }

    public async Task RegisterAgentAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            // Generate UUID if not exists
            if (string.IsNullOrEmpty(_config.AgentUuid))
            {
                _config.AgentUuid = Guid.NewGuid().ToString();
                _logger.LogInformation("Generated new Agent UUID: {UUID}", _config.AgentUuid);
            }

            var payload = new
            {
                name = _config.AgentName,
                uuid = _config.AgentUuid,
                location = _config.Location,
                description = $"CygnetCI Agent running on {Environment.MachineName}"
            };

            var content = new StringContent(
                JsonSerializer.Serialize(payload, _jsonOptions),
                Encoding.UTF8,
                "application/json");

            var response = await _httpClient.PostAsync("/agents", content, cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Agent registered successfully");
            }
            else if (response.StatusCode == System.Net.HttpStatusCode.BadRequest)
            {
                // Agent already exists, that's okay
                _logger.LogInformation("Agent already registered");
            }
            else
            {
                response.EnsureSuccessStatusCode();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to register agent");
            throw;
        }
    }

    public async Task SendHeartbeatAsync(SystemMetrics metrics, CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new
            {
                status = metrics.Status,
                cpu = metrics.CpuUsage,
                memory = metrics.MemoryUsage,
                jobs = metrics.ActiveJobs
            };

            var content = new StringContent(
                JsonSerializer.Serialize(payload, _jsonOptions),
                Encoding.UTF8,
                "application/json");

            var response = await _httpClient.PostAsync(
                $"/agents/{_config.AgentUuid}/heartbeat",
                content,
                cancellationToken);

            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send heartbeat");
        }
    }

    public async Task SendMonitoringDataAsync(MonitoringData data, CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new
            {
                windows_services = data.WindowsServices.Select(s => new
                {
                    name = s.Name,
                    display_name = s.DisplayName,
                    status = s.Status,
                    description = s.Description
                }).ToList(),
                drives = data.Drives.Select(d => new
                {
                    letter = d.Letter,
                    label = d.Label,
                    total_gb = d.TotalGB,
                    used_gb = d.UsedGB,
                    free_gb = d.FreeGB,
                    percent_used = d.PercentUsed
                }).ToList(),
                website_pings = data.WebsitePings.Select(p => new
                {
                    url = p.Url,
                    name = p.Name,
                    status = p.Status,
                    response_time_ms = p.ResponseTimeMs,
                    last_checked = p.LastChecked
                }).ToList()
            };

            var content = new StringContent(
                JsonSerializer.Serialize(payload, _jsonOptions),
                Encoding.UTF8,
                "application/json");

            var response = await _httpClient.PostAsync(
                $"/monitoring/agents/{_config.AgentUuid}/report",
                content,
                cancellationToken);

            response.EnsureSuccessStatusCode();

            _logger.LogDebug("Monitoring data sent: {ServiceCount} services, {DriveCount} drives, {PingCount} pings",
                data.WindowsServices.Count, data.Drives.Count, data.WebsitePings.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send monitoring data");
        }
    }

    public async Task<List<TaskInfo>> GetPendingTasksAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.GetAsync(
                $"/tasks/agent/{_config.AgentUuid}/pending",
                cancellationToken);

            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize<List<TaskInfo>>(json, _jsonOptions) ?? new List<TaskInfo>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get pending tasks");
            return new List<TaskInfo>();
        }
    }

    public async Task StreamLogAsync(int taskId, string logLine, CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new { log_line = logLine };

            var content = new StringContent(
                JsonSerializer.Serialize(payload, _jsonOptions),
                Encoding.UTF8,
                "application/json");

            await _httpClient.PostAsync(
                $"/tasks/{taskId}/logs",
                content,
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to stream log for task {TaskId}", taskId);
        }
    }

    public async Task CompleteTaskAsync(int taskId, bool success, int exitCode, CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new
            {
                success = success,
                exit_code = exitCode,
                status = success ? "completed" : "failed"
            };

            var content = new StringContent(
                JsonSerializer.Serialize(payload, _jsonOptions),
                Encoding.UTF8,
                "application/json");

            var response = await _httpClient.PostAsync(
                $"/tasks/{taskId}/complete",
                content,
                cancellationToken);

            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to complete task {TaskId}", taskId);
        }
    }

    public async Task<List<TransferFilePickup>> GetPendingDownloadsAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.GetAsync(
                $"/transfer/agent/{_config.AgentUuid}/downloads",
                cancellationToken);

            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize<List<TransferFilePickup>>(json, _jsonOptions) ?? new List<TransferFilePickup>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get pending downloads");
            return new List<TransferFilePickup>();
        }
    }

    public async Task<byte[]> DownloadFileAsync(int pickupId, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.GetAsync(
                $"/transfer/download/{pickupId}",
                cancellationToken);

            response.EnsureSuccessStatusCode();

            return await response.Content.ReadAsByteArrayAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download file for pickup {PickupId}", pickupId);
            throw;
        }
    }

    public async Task AcknowledgeDownloadAsync(int pickupId, bool success, CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new { success = success };

            var content = new StringContent(
                JsonSerializer.Serialize(payload, _jsonOptions),
                Encoding.UTF8,
                "application/json");

            var response = await _httpClient.PostAsync(
                $"/transfer/acknowledge/{pickupId}",
                content,
                cancellationToken);

            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to acknowledge download for pickup {PickupId}", pickupId);
        }
    }

    public async Task<List<ReleasePickupInfo>> GetPendingReleasePickupsAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.GetAsync(
                $"/releases/pickup/{_config.AgentUuid}",
                cancellationToken);

            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize<List<ReleasePickupInfo>>(json, _jsonOptions) ?? new List<ReleasePickupInfo>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get pending release pickups");
            return new List<ReleasePickupInfo>();
        }
    }

    public async Task AcknowledgeReleasePickupAsync(int pickupId, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.PostAsync(
                $"/releases/pickup/{pickupId}/acknowledge",
                null,
                cancellationToken);

            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to acknowledge release pickup {PickupId}", pickupId);
        }
    }

    public async Task StartReleasePickupAsync(int pickupId, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.PostAsync(
                $"/releases/pickup/{pickupId}/start",
                null,
                cancellationToken);

            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start release pickup {PickupId}", pickupId);
        }
    }

    public async Task StreamReleaseLogAsync(int pickupId, string logLine, string logLevel = "info", CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new
            {
                log_line = logLine,
                log_level = logLevel
            };

            var content = new StringContent(
                JsonSerializer.Serialize(payload, _jsonOptions),
                Encoding.UTF8,
                "application/json");

            await _httpClient.PostAsync(
                $"/releases/pickup/{pickupId}/log",
                content,
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to stream release log for pickup {PickupId}", pickupId);
        }
    }

    public async Task CompleteReleasePickupAsync(int pickupId, bool success, string? errorMessage = null, CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new
            {
                success = success,
                error_message = errorMessage
            };

            var content = new StringContent(
                JsonSerializer.Serialize(payload, _jsonOptions),
                Encoding.UTF8,
                "application/json");

            var response = await _httpClient.PostAsync(
                $"/releases/pickup/{pickupId}/complete",
                content,
                cancellationToken);

            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to complete release pickup {PickupId}", pickupId);
        }
    }

    // Pipeline Pickup Methods
    public async Task<List<PipelinePickupInfo>> GetPendingPipelinePickupsAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.GetAsync(
                $"/pipelines/pickup/{_config.AgentUuid}",
                cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<List<PipelinePickupInfo>>(content, _jsonOptions) ?? new List<PipelinePickupInfo>();
            }

            return new List<PipelinePickupInfo>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get pending pipeline pickups");
            return new List<PipelinePickupInfo>();
        }
    }

    public async Task AcknowledgePipelinePickupAsync(int pickupId, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.PostAsync(
                $"/pipelines/pickup/{pickupId}/acknowledge",
                null,
                cancellationToken);

            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to acknowledge pipeline pickup {PickupId}", pickupId);
        }
    }

    public async Task StartPipelinePickupAsync(int pickupId, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.PostAsync(
                $"/pipelines/pickup/{pickupId}/start",
                null,
                cancellationToken);

            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start pipeline pickup {PickupId}", pickupId);
        }
    }

    public async Task StreamPipelineLogAsync(int pickupId, string logLine, string logLevel = "info", string? stepName = null, CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new
            {
                message = logLine,
                log_level = logLevel,
                step_name = stepName,
                step_index = (int?)null
            };

            var content = new StringContent(
                JsonSerializer.Serialize(payload, _jsonOptions),
                Encoding.UTF8,
                "application/json");

            await _httpClient.PostAsync(
                $"/pipelines/pickup/{pickupId}/log",
                content,
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to stream pipeline log for pickup {PickupId}", pickupId);
        }
    }

    public async Task CompletePipelinePickupAsync(int pickupId, bool success, string? errorMessage = null, CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new
            {
                success = success,
                error_message = errorMessage
            };

            var content = new StringContent(
                JsonSerializer.Serialize(payload, _jsonOptions),
                Encoding.UTF8,
                "application/json");

            var response = await _httpClient.PostAsync(
                $"/pipelines/pickup/{pickupId}/complete",
                content,
                cancellationToken);

            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to complete pipeline pickup {PickupId}", pickupId);
        }
    }
}
