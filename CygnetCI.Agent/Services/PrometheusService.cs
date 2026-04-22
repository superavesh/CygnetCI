using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CygnetCI.Agent.Http;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Services;

/// <summary>
/// Polls Prometheus for every enabled KubernetesCluster in parallel.
/// Each cluster runs its own independent polling loop using its own HttpClient.
/// </summary>
public class PrometheusService : BackgroundService
{
    private readonly ILogger<PrometheusService> _logger;
    private readonly List<KubernetesClusterConfig> _clusters;
    private readonly ICygnetApiClient _apiClient;

    private static readonly JsonSerializerOptions _jsonOut = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        WriteIndented = false
    };

    public PrometheusService(
        ILogger<PrometheusService> logger,
        IOptions<AgentConfiguration> config,
        ICygnetApiClient apiClient)
    {
        _logger = logger;
        _apiClient = apiClient;
        _clusters = config.Value.KubernetesClusters
            .Where(c => c.Prometheus.Enabled && !string.IsNullOrWhiteSpace(c.Prometheus.Url))
            .ToList();
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (_clusters.Count == 0)
        {
            _logger.LogInformation("PrometheusService: no enabled clusters configured — exiting.");
            return;
        }

        _logger.LogInformation("PrometheusService: starting polling for {Count} cluster(s): {Names}",
            _clusters.Count, string.Join(", ", _clusters.Select(c => c.ClusterName)));

        // One polling loop per cluster, all running in parallel.
        var tasks = _clusters.Select(cluster => PollClusterAsync(cluster, ct));
        await Task.WhenAll(tasks);
    }

    // ─── Per-cluster polling loop ──────────────────────────────────────────────

    private async Task PollClusterAsync(KubernetesClusterConfig cluster, CancellationToken ct)
    {
        var settings = cluster.Prometheus;
        using var http = CreateHttpClient(settings);

        _logger.LogInformation(
            "Prometheus polling started for cluster '{Cluster}' — every {Interval}s from {Url}",
            cluster.ClusterName, settings.QueryIntervalSeconds, settings.Url);

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(settings.QueryIntervalSeconds));

        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                var snapshot = await CollectMetricsAsync(http, settings, ct);
                snapshot.ClusterName = cluster.ClusterName;
                await _apiClient.PostK8sMetricsAsync(snapshot, ct);
                _logger.LogDebug(
                    "K8s metrics posted for cluster '{Cluster}': {Nodes} nodes, {Pods} pods, {Deploys} deployments, {Alerts} alerts",
                    cluster.ClusterName, snapshot.Nodes.Count, snapshot.Pods.Count,
                    snapshot.Deployments.Count, snapshot.FiringAlerts.Count);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to collect/post K8s metrics for cluster '{Cluster}'",
                    cluster.ClusterName);
            }
        }

        _logger.LogInformation("Prometheus polling stopped for cluster '{Cluster}'", cluster.ClusterName);
    }

    private static HttpClient CreateHttpClient(PrometheusSettings settings)
    {
        var handler = new HttpClientHandler();
        var http = new HttpClient(handler)
        {
            BaseAddress = new Uri(settings.Url.TrimEnd('/') + "/"),
            Timeout = TimeSpan.FromSeconds(30)
        };
        if (!string.IsNullOrWhiteSpace(settings.Username))
        {
            var credentials = Convert.ToBase64String(
                Encoding.UTF8.GetBytes($"{settings.Username}:{settings.Password}"));
            http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Basic", credentials);
        }
        return http;
    }

    // ─── Metric Collection ────────────────────────────────────────────────────

    private async Task<K8sMetricsSnapshot> CollectMetricsAsync(
        HttpClient http, PrometheusSettings settings, CancellationToken ct)
    {
        var nsFilter = settings.Namespaces.Count > 0
            ? $",namespace=~\"{string.Join("|", settings.Namespaces)}\""
            : string.Empty;
        var nsOnly = settings.Namespaces.Count > 0
            ? $"namespace=~\"{string.Join("|", settings.Namespaces)}\""
            : string.Empty;

        var snapshot = new K8sMetricsSnapshot { CollectedAt = DateTime.UtcNow };

        // Per-resource queries
        var tNodeCpu      = QueryAsync(http, "1 - avg by (node) (rate(node_cpu_seconds_total{mode=\"idle\"}[5m]))", ct);
        var tNodeMem      = QueryAsync(http, "1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)", ct);
        var tNodeReady    = QueryAsync(http, "kube_node_status_condition{condition=\"Ready\",status=\"true\"}", ct);
        var tPodPhase     = QueryAsync(http, $"kube_pod_status_phase{{{nsOnly}}}", ct);
        var tPodRestarts  = QueryAsync(http, $"kube_pod_container_status_restarts_total{{{nsOnly}}}", ct);
        var tPodCpu       = QueryAsync(http, $"rate(container_cpu_usage_seconds_total{{container!=\"\"{nsFilter}}}[5m])", ct);
        var tPodMem       = QueryAsync(http, $"container_memory_working_set_bytes{{container!=\"\"{nsFilter}}}", ct);
        var tDepDesired   = QueryAsync(http, $"kube_deployment_spec_replicas{{{nsOnly}}}", ct);
        var tDepReady     = QueryAsync(http, $"kube_deployment_status_replicas_ready{{{nsOnly}}}", ct);
        var tDepAvail     = QueryAsync(http, $"kube_deployment_status_replicas_available{{{nsOnly}}}", ct);
        var tAlerts       = QueryAsync(http, "ALERTS{alertstate=\"firing\"}", ct);

        // Cluster-level overview
        var tClusterCpu   = ScalarQueryAsync(http, "sum(machine_cpu_cores)", ct);
        var tClusterMem   = ScalarQueryAsync(http, "sum(machine_memory_bytes)", ct);
        var tNsCpuUsage   = ScalarQueryAsync(http, $"sum(rate(container_cpu_usage_seconds_total{{container!=\"\"{nsFilter}}}[5m]))", ct);
        var tNsCpuReq     = ScalarQueryAsync(http, $"sum(kube_pod_container_resource_requests{{resource=\"cpu\"{nsFilter}}})", ct);
        var tNsCpuLim     = ScalarQueryAsync(http, $"sum(kube_pod_container_resource_limits{{resource=\"cpu\"{nsFilter}}})", ct);
        var tNsMemUsage   = ScalarQueryAsync(http, $"sum(container_memory_working_set_bytes{{container!=\"\"{nsFilter}}})", ct);
        var tNsMemReq     = ScalarQueryAsync(http, $"sum(kube_pod_container_resource_requests{{resource=\"memory\"{nsFilter}}})", ct);
        var tNsMemLim     = ScalarQueryAsync(http, $"sum(kube_pod_container_resource_limits{{resource=\"memory\"{nsFilter}}})", ct);

        // Resource counts
        var tSvcCount     = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "count(kube_service_info)" : $"count(kube_service_info{{{nsOnly}}})", ct);
        var tStsCount     = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "count(kube_statefulset_labels)" : $"count(kube_statefulset_labels{{{nsOnly}}})", ct);
        var tDsCount      = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "count(kube_daemonset_labels)" : $"count(kube_daemonset_labels{{{nsOnly}}})", ct);
        var tPvcCount     = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "count(kube_persistentvolumeclaim_info)" : $"count(kube_persistentvolumeclaim_info{{{nsOnly}}})", ct);
        var tCmCount      = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "count(kube_configmap_info)" : $"count(kube_configmap_info{{{nsOnly}}})", ct);
        var tSecretCount  = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "count(kube_secret_info)" : $"count(kube_secret_info{{{nsOnly}}})", ct);
        var tHpaCount     = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "count(kube_hpa_labels)" : $"count(kube_hpa_labels{{{nsOnly}}})", ct);

        // Pod phase breakdown
        var tPodsRunning   = ScalarQueryAsync(http, $"sum(kube_pod_status_phase{{phase=\"Running\"{nsFilter}}})", ct);
        var tPodsPending   = ScalarQueryAsync(http, $"sum(kube_pod_status_phase{{phase=\"Pending\"{nsFilter}}})", ct);
        var tPodsFailed    = ScalarQueryAsync(http, $"sum(kube_pod_status_phase{{phase=\"Failed\"{nsFilter}}})", ct);
        var tPodsSucceeded = ScalarQueryAsync(http, $"sum(kube_pod_status_phase{{phase=\"Succeeded\"{nsFilter}}})", ct);
        var tPodsUnknown   = ScalarQueryAsync(http, $"sum(kube_pod_status_phase{{phase=\"Unknown\"{nsFilter}}})", ct);

        // Container status
        var tContRunning    = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "sum(kube_pod_container_status_running)" : $"sum(kube_pod_container_status_running{{{nsOnly}}})", ct);
        var tContWaiting    = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "sum(kube_pod_container_status_waiting)" : $"sum(kube_pod_container_status_waiting{{{nsOnly}}})", ct);
        var tContTerminated = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "sum(kube_pod_container_status_terminated)" : $"sum(kube_pod_container_status_terminated{{{nsOnly}}})", ct);
        var tContRestarts   = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "sum(delta(kube_pod_container_status_restarts_total[30m]))" : $"sum(delta(kube_pod_container_status_restarts_total{{{nsOnly}}}[30m]))", ct);

        // Network I/O
        var tNetRx = ScalarQueryAsync(http, $"sum(rate(container_network_receive_bytes_total{{container!=\"\"{nsFilter}}}[5m]))", ct);
        var tNetTx = ScalarQueryAsync(http, $"sum(rate(container_network_transmit_bytes_total{{container!=\"\"{nsFilter}}}[5m]))", ct);

        // Disk I/O
        var tDiskRead  = ScalarQueryAsync(http, "sum(rate(node_disk_read_bytes_total[5m]))", ct);
        var tDiskWrite = ScalarQueryAsync(http, "sum(rate(node_disk_written_bytes_total[5m]))", ct);

        // Jobs
        var tJobsOk     = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "sum(kube_job_status_succeeded)" : $"sum(kube_job_status_succeeded{{{nsOnly}}})", ct);
        var tJobsActive = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "sum(kube_job_status_active)" : $"sum(kube_job_status_active{{{nsOnly}}})", ct);
        var tJobsFailed = ScalarQueryAsync(http, string.IsNullOrEmpty(nsOnly) ? "sum(kube_job_status_failed)" : $"sum(kube_job_status_failed{{{nsOnly}}})", ct);

        // Node counts
        var tNodesTotal         = ScalarQueryAsync(http, "count(kube_node_info)", ct);
        var tNodesUnschedulable = ScalarQueryAsync(http, "sum(kube_node_spec_unschedulable)", ct);

        await Task.WhenAll(
            tNodeCpu, tNodeMem, tNodeReady, tPodPhase, tPodRestarts,
            tPodCpu, tPodMem, tDepDesired, tDepReady, tDepAvail, tAlerts,
            tClusterCpu, tClusterMem, tNsCpuUsage, tNsCpuReq, tNsCpuLim,
            tNsMemUsage, tNsMemReq, tNsMemLim,
            tSvcCount, tStsCount, tDsCount, tPvcCount, tCmCount, tSecretCount, tHpaCount,
            tPodsRunning, tPodsPending, tPodsFailed, tPodsSucceeded, tPodsUnknown,
            tContRunning, tContWaiting, tContTerminated, tContRestarts,
            tNetRx, tNetTx, tDiskRead, tDiskWrite,
            tJobsOk, tJobsActive, tJobsFailed,
            tNodesTotal, tNodesUnschedulable);

        snapshot.Nodes = BuildNodeMetrics(tNodeCpu.Result, tNodeMem.Result, tNodeReady.Result);
        snapshot.Pods = BuildPodMetrics(tPodPhase.Result, tPodRestarts.Result, tPodCpu.Result, tPodMem.Result);
        snapshot.Deployments = BuildDeploymentMetrics(tDepDesired.Result, tDepReady.Result, tDepAvail.Result);
        snapshot.FiringAlerts = BuildAlerts(tAlerts.Result);

        snapshot.ClusterCpuCoresTotal     = Math.Round(tClusterCpu.Result, 2);
        snapshot.ClusterMemoryBytesTotal  = Math.Round(tClusterMem.Result, 0);
        snapshot.NamespaceCpuUsageCores   = Math.Round(tNsCpuUsage.Result, 4);
        snapshot.NamespaceCpuRequestsCores = Math.Round(tNsCpuReq.Result, 4);
        snapshot.NamespaceCpuLimitsCores  = Math.Round(tNsCpuLim.Result, 4);
        snapshot.NamespaceMemoryUsageBytes = Math.Round(tNsMemUsage.Result, 0);
        snapshot.NamespaceMemoryRequestsBytes = Math.Round(tNsMemReq.Result, 0);
        snapshot.NamespaceMemoryLimitsBytes = Math.Round(tNsMemLim.Result, 0);

        snapshot.ResourceCounts = new Dictionary<string, int>
        {
            ["pods"]         = snapshot.Pods.Count,
            ["services"]     = (int)tSvcCount.Result,
            ["deployments"]  = snapshot.Deployments.Count,
            ["statefulsets"] = (int)tStsCount.Result,
            ["daemonsets"]   = (int)tDsCount.Result,
            ["pvcs"]         = (int)tPvcCount.Result,
            ["configmaps"]   = (int)tCmCount.Result,
            ["secrets"]      = (int)tSecretCount.Result,
            ["hpas"]         = (int)tHpaCount.Result,
        };

        snapshot.PodPhaseRunning   = (int)tPodsRunning.Result;
        snapshot.PodPhasePending   = (int)tPodsPending.Result;
        snapshot.PodPhaseFailed    = (int)tPodsFailed.Result;
        snapshot.PodPhaseSucceeded = (int)tPodsSucceeded.Result;
        snapshot.PodPhaseUnknown   = (int)tPodsUnknown.Result;

        snapshot.ContainersRunning        = (int)tContRunning.Result;
        snapshot.ContainersWaiting        = (int)tContWaiting.Result;
        snapshot.ContainersTerminated     = (int)tContTerminated.Result;
        snapshot.ContainerRestartsLast30m = Math.Round(tContRestarts.Result, 0);

        snapshot.NetworkReceiveBytesPerSec  = Math.Round(tNetRx.Result, 0);
        snapshot.NetworkTransmitBytesPerSec = Math.Round(tNetTx.Result, 0);
        snapshot.DiskReadBytesPerSec        = Math.Round(tDiskRead.Result, 0);
        snapshot.DiskWriteBytesPerSec       = Math.Round(tDiskWrite.Result, 0);

        snapshot.JobsSucceeded = (int)tJobsOk.Result;
        snapshot.JobsActive    = (int)tJobsActive.Result;
        snapshot.JobsFailed    = (int)tJobsFailed.Result;

        snapshot.NodesTotal         = (int)tNodesTotal.Result;
        snapshot.NodesUnschedulable = (int)tNodesUnschedulable.Result;

        return snapshot;
    }

    private static async Task<double> ScalarQueryAsync(HttpClient http, string promql, CancellationToken ct)
    {
        var results = await QueryAsync(http, promql, ct);
        if (results.Count == 0) return 0;
        double total = 0;
        foreach (var item in results)
            total += ParseValue(item?["value"]?[1]?.GetValue<string>());
        return total;
    }

    private static async Task<JsonArray> QueryAsync(HttpClient http, string promql, CancellationToken ct)
    {
        try
        {
            var encoded = Uri.EscapeDataString(promql);
            using var resp = await http.GetAsync($"api/v1/query?query={encoded}", ct);
            if (!resp.IsSuccessStatusCode) return new JsonArray();

            var json = await resp.Content.ReadAsStringAsync(ct);
            var doc = JsonNode.Parse(json);
            return doc?["data"]?["result"]?.AsArray() ?? new JsonArray();
        }
        catch { return new JsonArray(); }
    }

    // ─── Builders ─────────────────────────────────────────────────────────────

    private static List<K8sNodeMetric> BuildNodeMetrics(
        JsonArray cpuResult, JsonArray memResult, JsonArray readyResult)
    {
        var cpuMap   = ToMetricMap(cpuResult, "node");
        var memMap   = ToMetricMap(memResult, "node");
        var readyMap = ToMetricMap(readyResult, "node");

        var nodes = new Dictionary<string, K8sNodeMetric>();

        foreach (var (node, val) in cpuMap)
        {
            nodes.TryAdd(node, new K8sNodeMetric { NodeName = node });
            nodes[node].CpuUsagePercent = Math.Round(val * 100, 1);
        }
        foreach (var (node, val) in memMap)
        {
            nodes.TryAdd(node, new K8sNodeMetric { NodeName = node });
            nodes[node].MemoryUsagePercent = Math.Round(val * 100, 1);
        }
        foreach (var (node, val) in readyMap)
        {
            nodes.TryAdd(node, new K8sNodeMetric { NodeName = node });
            nodes[node].Status = val == 1 ? "Ready" : "NotReady";
        }

        return nodes.Values.ToList();
    }

    private static List<K8sPodMetric> BuildPodMetrics(
        JsonArray phaseResult, JsonArray restartsResult,
        JsonArray cpuResult, JsonArray memResult)
    {
        var pods = new Dictionary<string, K8sPodMetric>();

        foreach (var item in phaseResult)
        {
            var metric = item?["metric"];
            var pod   = metric?["pod"]?.GetValue<string>() ?? string.Empty;
            var ns    = metric?["namespace"]?.GetValue<string>() ?? string.Empty;
            var phase = metric?["phase"]?.GetValue<string>() ?? string.Empty;
            var val   = ParseValue(item?["value"]?[1]?.GetValue<string>());
            if (string.IsNullOrEmpty(pod) || val != 1) continue;
            pods[$"{ns}/{pod}"] = new K8sPodMetric { PodName = pod, Namespace = ns, Phase = phase };
        }

        foreach (var item in restartsResult)
        {
            var metric = item?["metric"];
            var pod = metric?["pod"]?.GetValue<string>() ?? string.Empty;
            var ns  = metric?["namespace"]?.GetValue<string>() ?? string.Empty;
            if (pods.TryGetValue($"{ns}/{pod}", out var p))
                p.RestartCount = (int)ParseValue(item?["value"]?[1]?.GetValue<string>());
        }

        foreach (var item in cpuResult)
        {
            var metric = item?["metric"];
            var pod = metric?["pod"]?.GetValue<string>() ?? string.Empty;
            var ns  = metric?["namespace"]?.GetValue<string>() ?? string.Empty;
            if (pods.TryGetValue($"{ns}/{pod}", out var p))
                p.CpuUsageCores = Math.Round(ParseValue(item?["value"]?[1]?.GetValue<string>()), 4);
        }

        foreach (var item in memResult)
        {
            var metric = item?["metric"];
            var pod = metric?["pod"]?.GetValue<string>() ?? string.Empty;
            var ns  = metric?["namespace"]?.GetValue<string>() ?? string.Empty;
            if (pods.TryGetValue($"{ns}/{pod}", out var p))
                p.MemoryUsageMb = Math.Round(ParseValue(item?["value"]?[1]?.GetValue<string>()) / 1_048_576, 1);
        }

        return pods.Values.ToList();
    }

    private static List<K8sDeploymentMetric> BuildDeploymentMetrics(
        JsonArray desiredResult, JsonArray readyResult, JsonArray availResult)
    {
        var deploys = new Dictionary<string, K8sDeploymentMetric>();

        void Fill(JsonArray arr, Action<K8sDeploymentMetric, int> setter)
        {
            foreach (var item in arr)
            {
                var metric = item?["metric"];
                var name = metric?["deployment"]?.GetValue<string>() ?? string.Empty;
                var ns   = metric?["namespace"]?.GetValue<string>() ?? string.Empty;
                var key  = $"{ns}/{name}";
                deploys.TryAdd(key, new K8sDeploymentMetric { DeploymentName = name, Namespace = ns });
                setter(deploys[key], (int)ParseValue(item?["value"]?[1]?.GetValue<string>()));
            }
        }

        Fill(desiredResult, (d, v) => d.DesiredReplicas = v);
        Fill(readyResult,   (d, v) => d.ReadyReplicas = v);
        Fill(availResult,   (d, v) => d.AvailableReplicas = v);

        return deploys.Values.ToList();
    }

    private static List<K8sAlert> BuildAlerts(JsonArray alertResult)
    {
        var list = new List<K8sAlert>();
        foreach (var item in alertResult)
        {
            var metric = item?["metric"];
            var name = metric?["alertname"]?.GetValue<string>() ?? string.Empty;
            if (string.IsNullOrEmpty(name)) continue;

            list.Add(new K8sAlert
            {
                AlertName = name,
                Severity  = metric?["severity"]?.GetValue<string>() ?? string.Empty,
                Namespace = metric?["namespace"]?.GetValue<string>() ?? string.Empty,
                Summary   = metric?["summary"]?.GetValue<string>()
                            ?? metric?["message"]?.GetValue<string>() ?? string.Empty,
                FiredAt   = DateTime.UtcNow
            });
        }
        return list;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private static Dictionary<string, double> ToMetricMap(JsonArray arr, string labelKey)
    {
        var map = new Dictionary<string, double>();
        foreach (var item in arr)
        {
            var key = item?["metric"]?[labelKey]?.GetValue<string>() ?? string.Empty;
            if (string.IsNullOrEmpty(key)) continue;
            map[key] = ParseValue(item?["value"]?[1]?.GetValue<string>());
        }
        return map;
    }

    private static double ParseValue(string? raw)
    {
        if (string.IsNullOrEmpty(raw)) return 0;
        return double.TryParse(raw, System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0;
    }
}
