using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Services;

public interface IArgocdService
{
    IReadOnlyList<string> ClusterNames { get; }
    Task<(bool success, string message)> CreateApplicationAsync(string clusterName, ArgocdAppDefinition definition, CancellationToken ct);
    Task<(bool success, string message)> SyncApplicationAsync(string clusterName, string appName, string imageRepository, string imageTag, CancellationToken ct);
    Task<ArgocdAppStatus?> GetApplicationStatusAsync(string clusterName, string appName, CancellationToken ct);
    Task<List<ArgocdAppStatus>> ListApplicationsAsync(string clusterName, CancellationToken ct);
    Task<(bool success, string message)> WaitForSyncAsync(string clusterName, string appName, CancellationToken ct);
}

public class ArgocdService : IArgocdService
{
    private readonly ILogger<ArgocdService> _logger;
    private readonly Dictionary<string, (ArgocdSettings Settings, HttpClient Http)> _clusters;

    private static readonly JsonSerializerOptions _json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public ArgocdService(ILogger<ArgocdService> logger, IOptions<AgentConfiguration> config)
    {
        _logger = logger;
        _clusters = config.Value.KubernetesClusters
            .Where(c => c.ArgoCD.Enabled && !string.IsNullOrWhiteSpace(c.ArgoCD.ServerUrl))
            .ToDictionary(
                c => c.ClusterName,
                c => (c.ArgoCD, CreateHttpClient(c.ArgoCD)));
    }

    public IReadOnlyList<string> ClusterNames => _clusters.Keys.ToList();

    private (ArgocdSettings Settings, HttpClient Http) GetCluster(string clusterName)
    {
        if (_clusters.TryGetValue(clusterName, out var cluster))
            return cluster;

        // Fall back to first cluster if name is empty/unset (single-cluster convenience)
        if (string.IsNullOrWhiteSpace(clusterName) && _clusters.Count > 0)
            return _clusters.Values.First();

        throw new InvalidOperationException(
            $"Cluster '{clusterName}' not found or ArgoCD not enabled. Available: {string.Join(", ", _clusters.Keys)}");
    }

    private static HttpClient CreateHttpClient(ArgocdSettings settings)
    {
        var handler = new HttpClientHandler();
        if (settings.InsecureSkipTlsVerify)
            handler.ServerCertificateCustomValidationCallback = (_, _, _, _) => true;

        var http = new HttpClient(handler)
        {
            BaseAddress = new Uri(settings.ServerUrl.TrimEnd('/') + "/"),
            Timeout = TimeSpan.FromSeconds(30)
        };
        http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", settings.Token);
        return http;
    }

    // ─── Create Application (onboarding) ─────────────────────────────────────

    public async Task<(bool success, string message)> CreateApplicationAsync(
        string clusterName, ArgocdAppDefinition definition, CancellationToken ct)
    {
        try
        {
            var (_, http) = GetCluster(clusterName);

            var existing = await GetApplicationStatusAsync(clusterName, definition.AppName, ct);
            if (existing != null)
                return (true, $"Application '{definition.AppName}' already exists in ArgoCD on cluster '{clusterName}' — skipping creation.");

            var helmParams = new List<object>
            {
                new { name = "image.repository", value = definition.ImageRepository },
                new { name = "image.tag", value = definition.ImageTag },
                new { name = "replicaCount", value = definition.Replicas.ToString() }
            };
            foreach (var (k, v) in definition.HelmValues)
                helmParams.Add(new { name = k, value = v });

            var appBody = new
            {
                apiVersion = "argoproj.io/v1alpha1",
                kind = "Application",
                metadata = new { name = definition.AppName, @namespace = "argocd" },
                spec = new
                {
                    project = "default",
                    source = new
                    {
                        repoURL = definition.HelmRepoUrl,
                        chart = definition.HelmChartName,
                        targetRevision = definition.HelmChartVersion,
                        helm = new { parameters = helmParams }
                    },
                    destination = new
                    {
                        server = "https://kubernetes.default.svc",
                        @namespace = definition.Namespace
                    },
                    syncPolicy = new
                    {
                        automated = (object?)null,
                        syncOptions = new[] { "CreateNamespace=true" }
                    }
                }
            };

            var json = JsonSerializer.Serialize(appBody, _json);
            using var response = await http.PostAsync(
                "api/v1/applications",
                new StringContent(json, Encoding.UTF8, "application/json"),
                ct);

            var body = await response.Content.ReadAsStringAsync(ct);
            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("ArgoCD application '{App}' created on cluster '{Cluster}'",
                    definition.AppName, clusterName);
                return (true, $"Application '{definition.AppName}' created in ArgoCD on cluster '{clusterName}'.");
            }

            _logger.LogError("ArgoCD create application failed on cluster '{Cluster}': {Status} {Body}",
                clusterName, response.StatusCode, body);
            return (false, $"ArgoCD returned {(int)response.StatusCode}: {body}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create ArgoCD application '{App}' on cluster '{Cluster}'",
                definition.AppName, clusterName);
            return (false, ex.Message);
        }
    }

    // ─── Sync (update image tag + trigger sync) ───────────────────────────────

    public async Task<(bool success, string message)> SyncApplicationAsync(
        string clusterName, string appName, string imageRepository, string imageTag, CancellationToken ct)
    {
        try
        {
            var (_, http) = GetCluster(clusterName);

            _logger.LogInformation("Setting image {Repo}:{Tag} on ArgoCD app '{App}' (cluster '{Cluster}')",
                imageRepository, imageTag, appName, clusterName);

            var patchBody = new
            {
                spec = new
                {
                    source = new
                    {
                        helm = new
                        {
                            parameters = new[]
                            {
                                new { name = "image.repository", value = imageRepository },
                                new { name = "image.tag", value = imageTag }
                            }
                        }
                    }
                }
            };

            var patchJson = JsonSerializer.Serialize(patchBody, _json);
            using var patchResp = await http.PatchAsync(
                $"api/v1/applications/{appName}",
                new StringContent(patchJson, Encoding.UTF8, "application/merge-patch+json"),
                ct);

            if (!patchResp.IsSuccessStatusCode)
            {
                var patchBody2 = await patchResp.Content.ReadAsStringAsync(ct);
                return (false, $"Failed to update image tag — ArgoCD returned {(int)patchResp.StatusCode}: {patchBody2}");
            }

            _logger.LogInformation("Triggering ArgoCD sync for app '{App}' on cluster '{Cluster}'",
                appName, clusterName);

            var syncBody = JsonSerializer.Serialize(new { prune = false, dryRun = false }, _json);
            using var syncResp = await http.PostAsync(
                $"api/v1/applications/{appName}/sync",
                new StringContent(syncBody, Encoding.UTF8, "application/json"),
                ct);

            if (!syncResp.IsSuccessStatusCode)
            {
                var sb = await syncResp.Content.ReadAsStringAsync(ct);
                return (false, $"Sync trigger failed — ArgoCD returned {(int)syncResp.StatusCode}: {sb}");
            }

            return (true, $"Sync triggered for '{appName}' with image {imageRepository}:{imageTag} on cluster '{clusterName}'");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to sync ArgoCD application '{App}' on cluster '{Cluster}'",
                appName, clusterName);
            return (false, ex.Message);
        }
    }

    // ─── Poll until Synced + Healthy ─────────────────────────────────────────

    public async Task<(bool success, string message)> WaitForSyncAsync(
        string clusterName, string appName, CancellationToken ct)
    {
        var (settings, _) = GetCluster(clusterName);
        var deadline = DateTime.UtcNow.AddSeconds(settings.SyncTimeoutSeconds);

        _logger.LogInformation("Waiting for ArgoCD sync of '{App}' on cluster '{Cluster}' (timeout {Timeout}s)",
            appName, clusterName, settings.SyncTimeoutSeconds);

        while (DateTime.UtcNow < deadline && !ct.IsCancellationRequested)
        {
            var status = await GetApplicationStatusAsync(clusterName, appName, ct);
            if (status == null)
                return (false, $"Application '{appName}' not found in ArgoCD on cluster '{clusterName}'");

            _logger.LogDebug("ArgoCD '{App}' on '{Cluster}': sync={Sync} health={Health}",
                appName, clusterName, status.SyncStatus, status.HealthStatus);

            if (status.SyncStatus == "Synced" && status.HealthStatus == "Healthy")
                return (true, $"Application '{appName}' is Synced and Healthy on cluster '{clusterName}'. Image: {status.CurrentImage}");

            if (status.HealthStatus == "Degraded")
                return (false, $"Application '{appName}' is Degraded on cluster '{clusterName}': {status.Message}");

            await Task.Delay(TimeSpan.FromSeconds(settings.SyncPollIntervalSeconds), ct);
        }

        return (false, $"Timed out waiting for '{appName}' to sync on cluster '{clusterName}' after {settings.SyncTimeoutSeconds}s");
    }

    // ─── Get single app status ────────────────────────────────────────────────

    public async Task<ArgocdAppStatus?> GetApplicationStatusAsync(
        string clusterName, string appName, CancellationToken ct)
    {
        try
        {
            var (_, http) = GetCluster(clusterName);
            using var resp = await http.GetAsync($"api/v1/applications/{appName}", ct);
            if (resp.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
            resp.EnsureSuccessStatusCode();

            var json = await resp.Content.ReadAsStringAsync(ct);
            return ParseAppStatus(json);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to get ArgoCD app status for '{App}' on cluster '{Cluster}'",
                appName, clusterName);
            return null;
        }
    }

    // ─── List all apps ────────────────────────────────────────────────────────

    public async Task<List<ArgocdAppStatus>> ListApplicationsAsync(string clusterName, CancellationToken ct)
    {
        try
        {
            var (_, http) = GetCluster(clusterName);
            using var resp = await http.GetAsync("api/v1/applications", ct);
            resp.EnsureSuccessStatusCode();

            var json = await resp.Content.ReadAsStringAsync(ct);
            var doc = JsonNode.Parse(json);
            var items = doc?["items"]?.AsArray();
            if (items == null) return new List<ArgocdAppStatus>();

            return items
                .Select(item => ParseAppStatus(item?.ToJsonString() ?? "{}"))
                .Where(s => s != null)
                .Cast<ArgocdAppStatus>()
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to list ArgoCD applications on cluster '{Cluster}'", clusterName);
            return new List<ArgocdAppStatus>();
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private static ArgocdAppStatus? ParseAppStatus(string json)
    {
        try
        {
            var doc = JsonNode.Parse(json);
            if (doc == null) return null;

            var name   = doc["metadata"]?["name"]?.GetValue<string>() ?? string.Empty;
            var sync   = doc["status"]?["sync"]?["status"]?.GetValue<string>() ?? "Unknown";
            var health = doc["status"]?["health"]?["status"]?.GetValue<string>() ?? "Unknown";
            var message = doc["status"]?["operationState"]?["message"]?.GetValue<string>() ?? string.Empty;

            var images = doc["status"]?["summary"]?["images"]?.AsArray();
            var currentImage = images?.FirstOrDefault()?.GetValue<string>() ?? string.Empty;

            DateTime? lastSynced = null;
            var syncedAtStr = doc["status"]?["operationState"]?["finishedAt"]?.GetValue<string>();
            if (DateTime.TryParse(syncedAtStr, out var parsed))
                lastSynced = parsed;

            return new ArgocdAppStatus
            {
                AppName       = name,
                SyncStatus    = sync,
                HealthStatus  = health,
                Message       = message,
                CurrentImage  = currentImage,
                LastSyncedAt  = lastSynced
            };
        }
        catch { return null; }
    }
}
