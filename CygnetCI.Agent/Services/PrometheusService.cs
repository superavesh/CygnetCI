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
/// Polls Prometheus on a schedule, collects K8s pod/node/deployment/alert metrics,
/// and forwards them to the CygnetCI FastAPI server.
/// Only active when Prometheus.Enabled = true in config.
/// </summary>
public class PrometheusService : IHostedService
{
    private readonly ILogger<PrometheusService> _logger;
    private readonly PrometheusSettings _settings;
    private readonly ICygnetApiClient _apiClient;
    private readonly HttpClient _http;
    private CancellationTokenSource? _cts;
    private Task? _task;

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
        _settings = config.Value.Prometheus;
        _apiClient = apiClient;

        var handler = new HttpClientHandler();
        _http = new HttpClient(handler)
        {
            BaseAddress = new Uri(_settings.Url.TrimEnd('/') + "/"),
            Timeout = TimeSpan.FromSeconds(30)
        };

        if (!string.IsNullOrWhiteSpace(_settings.Username))
        {
            var credentials = Convert.ToBase64String(
                Encoding.UTF8.GetBytes($"{_settings.Username}:{_settings.Password}"));
            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Basic", credentials);
        }
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Prometheus service starting — polling every {Interval}s from {Url}",
            _settings.QueryIntervalSeconds, _settings.Url);

        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _task = RunAsync(_cts.Token);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _cts?.Cancel();
        if (_task != null)
            await Task.WhenAny(_task, Task.Delay(5000, cancellationToken));
    }

    private async Task RunAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_settings.QueryIntervalSeconds));

        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                var snapshot = await CollectMetricsAsync(ct);
                await _apiClient.PostK8sMetricsAsync(snapshot, ct);
                _logger.LogDebug("K8s metrics posted: {Nodes} nodes, {Pods} pods, {Deploys} deployments, {Alerts} alerts",
                    snapshot.Nodes.Count, snapshot.Pods.Count, snapshot.Deployments.Count, snapshot.FiringAlerts.Count);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to collect/post Prometheus K8s metrics");
            }
        }
    }

    // ─── Metric Collection ────────────────────────────────────────────────────

    private async Task<K8sMetricsSnapshot> CollectMetricsAsync(CancellationToken ct)
    {
        var nsFilter = _settings.Namespaces.Count > 0
            ? $",namespace=~\"{string.Join("|", _settings.Namespaces)}\""
            : string.Empty;

        var snapshot = new K8sMetricsSnapshot { CollectedAt = DateTime.UtcNow };

        // Run all queries in parallel
        var tNodeCpu      = QueryAsync("1 - avg by (node) (rate(node_cpu_seconds_total{mode=\"idle\"}[5m]))", ct);
        var tNodeMem      = QueryAsync("1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)", ct);
        var tNodeReady    = QueryAsync("kube_node_status_condition{condition=\"Ready\",status=\"true\"}", ct);
        var tPodPhase     = QueryAsync($"kube_pod_status_phase{{{nsFilter.TrimStart(',')}}}", ct);
        var tPodRestarts  = QueryAsync($"kube_pod_container_status_restarts_total{{{nsFilter.TrimStart(',')}}}", ct);
        var tPodCpu       = QueryAsync($"rate(container_cpu_usage_seconds_total{{container!=\"\"{nsFilter}}}[5m])", ct);
        var tPodMem       = QueryAsync($"container_memory_working_set_bytes{{container!=\"\"{nsFilter}}}", ct);
        var tDepDesired   = QueryAsync($"kube_deployment_spec_replicas{{{nsFilter.TrimStart(',')}}}", ct);
        var tDepReady     = QueryAsync($"kube_deployment_status_replicas_ready{{{nsFilter.TrimStart(',')}}}", ct);
        var tDepAvail     = QueryAsync($"kube_deployment_status_replicas_available{{{nsFilter.TrimStart(',')}}}", ct);
        var tAlerts       = QueryAsync("ALERTS{alertstate=\"firing\"}", ct);

        await Task.WhenAll(tNodeCpu, tNodeMem, tNodeReady, tPodPhase, tPodRestarts,
                           tPodCpu, tPodMem, tDepDesired, tDepReady, tDepAvail, tAlerts);

        var nodeCpu     = tNodeCpu.Result;
        var nodeMem     = tNodeMem.Result;
        var nodeReady   = tNodeReady.Result;
        var podPhase    = tPodPhase.Result;
        var podRestarts = tPodRestarts.Result;
        var podCpu      = tPodCpu.Result;
        var podMem      = tPodMem.Result;
        var deployDesired = tDepDesired.Result;
        var deployReady   = tDepReady.Result;
        var deployAvail   = tDepAvail.Result;
        var alerts        = tAlerts.Result;

        snapshot.Nodes = BuildNodeMetrics(nodeCpu, nodeMem, nodeReady);
        snapshot.Pods = BuildPodMetrics(podPhase, podRestarts, podCpu, podMem);
        snapshot.Deployments = BuildDeploymentMetrics(deployDesired, deployReady, deployAvail);
        snapshot.FiringAlerts = BuildAlerts(alerts);

        return snapshot;
    }

    private async Task<JsonArray> QueryAsync(string promql, CancellationToken ct)
    {
        try
        {
            var encoded = Uri.EscapeDataString(promql);
            using var resp = await _http.GetAsync($"api/v1/query?query={encoded}", ct);
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
        var cpuMap = ToMetricMap(cpuResult, "node");
        var memMap = ToMetricMap(memResult, "node");
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
            var pod = metric?["pod"]?.GetValue<string>() ?? string.Empty;
            var ns = metric?["namespace"]?.GetValue<string>() ?? string.Empty;
            var phase = metric?["phase"]?.GetValue<string>() ?? string.Empty;
            var val = ParseValue(item?["value"]?[1]?.GetValue<string>());

            if (string.IsNullOrEmpty(pod) || val != 1) continue;

            var key = $"{ns}/{pod}";
            pods[key] = new K8sPodMetric { PodName = pod, Namespace = ns, Phase = phase };
        }

        foreach (var item in restartsResult)
        {
            var metric = item?["metric"];
            var pod = metric?["pod"]?.GetValue<string>() ?? string.Empty;
            var ns = metric?["namespace"]?.GetValue<string>() ?? string.Empty;
            var key = $"{ns}/{pod}";
            if (pods.TryGetValue(key, out var p))
                p.RestartCount = (int)ParseValue(item?["value"]?[1]?.GetValue<string>());
        }

        foreach (var item in cpuResult)
        {
            var metric = item?["metric"];
            var pod = metric?["pod"]?.GetValue<string>() ?? string.Empty;
            var ns = metric?["namespace"]?.GetValue<string>() ?? string.Empty;
            var key = $"{ns}/{pod}";
            if (pods.TryGetValue(key, out var p))
                p.CpuUsageCores = Math.Round(ParseValue(item?["value"]?[1]?.GetValue<string>()), 4);
        }

        foreach (var item in memResult)
        {
            var metric = item?["metric"];
            var pod = metric?["pod"]?.GetValue<string>() ?? string.Empty;
            var ns = metric?["namespace"]?.GetValue<string>() ?? string.Empty;
            var key = $"{ns}/{pod}";
            if (pods.TryGetValue(key, out var p))
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
                var ns = metric?["namespace"]?.GetValue<string>() ?? string.Empty;
                var key = $"{ns}/{name}";
                deploys.TryAdd(key, new K8sDeploymentMetric { DeploymentName = name, Namespace = ns });
                setter(deploys[key], (int)ParseValue(item?["value"]?[1]?.GetValue<string>()));
            }
        }

        Fill(desiredResult, (d, v) => d.DesiredReplicas = v);
        Fill(readyResult, (d, v) => d.ReadyReplicas = v);
        Fill(availResult, (d, v) => d.AvailableReplicas = v);

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
                Severity = metric?["severity"]?.GetValue<string>() ?? string.Empty,
                Namespace = metric?["namespace"]?.GetValue<string>() ?? string.Empty,
                Summary = metric?["summary"]?.GetValue<string>()
                          ?? metric?["message"]?.GetValue<string>() ?? string.Empty,
                FiredAt = DateTime.UtcNow
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
