namespace CygnetCI.Agent.Models;

// ─── ArgoCD ──────────────────────────────────────────────────────────────────

public class ArgocdAppDefinition
{
    public string ClusterName { get; set; } = string.Empty;
    public string AppName { get; set; } = string.Empty;
    public string Namespace { get; set; } = "default";
    public string HelmRepoUrl { get; set; } = string.Empty;
    public string HelmChartName { get; set; } = string.Empty;
    public string HelmChartVersion { get; set; } = string.Empty;
    public string ImageRepository { get; set; } = string.Empty;
    public string ImageTag { get; set; } = "latest";
    public int Replicas { get; set; } = 1;
    public Dictionary<string, string> HelmValues { get; set; } = new();
}

public class ArgocdSyncCommand
{
    public string ClusterName { get; set; } = string.Empty;
    public string AppName { get; set; } = string.Empty;
    public string ImageTag { get; set; } = string.Empty;
    public string ImageRepository { get; set; } = string.Empty;
}

public class ArgocdAppStatus
{
    public string AppName { get; set; } = string.Empty;
    public string SyncStatus { get; set; } = string.Empty;    // Synced / OutOfSync / Unknown
    public string HealthStatus { get; set; } = string.Empty;  // Healthy / Progressing / Degraded / Missing
    public string Message { get; set; } = string.Empty;
    public string CurrentImage { get; set; } = string.Empty;
    public DateTime? LastSyncedAt { get; set; }
}

// ─── Prometheus / K8s Observability ──────────────────────────────────────────

public class K8sMetricsSnapshot
{
    public string ClusterName { get; set; } = string.Empty;
    public DateTime CollectedAt { get; set; } = DateTime.UtcNow;
    public List<K8sNodeMetric> Nodes { get; set; } = new();
    public List<K8sPodMetric> Pods { get; set; } = new();
    public List<K8sDeploymentMetric> Deployments { get; set; } = new();
    public List<K8sAlert> FiringAlerts { get; set; } = new();

    // Cluster-level overview (mirrors Grafana namespace dashboard)
    public double ClusterCpuCoresTotal { get; set; }
    public double ClusterMemoryBytesTotal { get; set; }
    public double NamespaceCpuUsageCores { get; set; }
    public double NamespaceCpuRequestsCores { get; set; }
    public double NamespaceCpuLimitsCores { get; set; }
    public double NamespaceMemoryUsageBytes { get; set; }
    public double NamespaceMemoryRequestsBytes { get; set; }
    public double NamespaceMemoryLimitsBytes { get; set; }

    // Resource counts: pods, services, deployments, statefulsets, daemonsets, pvcs, configmaps, secrets
    public Dictionary<string, int> ResourceCounts { get; set; } = new();

    // Pod phase breakdown (from kube_pod_status_phase)
    public int PodPhaseRunning { get; set; }
    public int PodPhasePending { get; set; }
    public int PodPhaseFailed { get; set; }
    public int PodPhaseSucceeded { get; set; }
    public int PodPhaseUnknown { get; set; }

    // Container status (from kube_pod_container_status_*)
    public int ContainersRunning { get; set; }
    public int ContainersWaiting { get; set; }
    public int ContainersTerminated { get; set; }
    public double ContainerRestartsLast30m { get; set; }

    // Network I/O (bytes/sec, cluster-level from cAdvisor)
    public double NetworkReceiveBytesPerSec { get; set; }
    public double NetworkTransmitBytesPerSec { get; set; }

    // Disk I/O (bytes/sec, node-level from node-exporter)
    public double DiskReadBytesPerSec { get; set; }
    public double DiskWriteBytesPerSec { get; set; }

    // Jobs (from kube_job_status_*)
    public int JobsSucceeded { get; set; }
    public int JobsActive { get; set; }
    public int JobsFailed { get; set; }

    // Node counts
    public int NodesTotal { get; set; }
    public int NodesUnschedulable { get; set; }
}

public class K8sNodeMetric
{
    public string NodeName { get; set; } = string.Empty;
    public double CpuUsagePercent { get; set; }
    public double MemoryUsagePercent { get; set; }
    public string Status { get; set; } = string.Empty;  // Ready / NotReady
}

public class K8sPodMetric
{
    public string PodName { get; set; } = string.Empty;
    public string Namespace { get; set; } = string.Empty;
    public string Phase { get; set; } = string.Empty;   // Running / Pending / Failed / Succeeded
    public int RestartCount { get; set; }
    public double CpuUsageCores { get; set; }
    public double MemoryUsageMb { get; set; }
    public string ContainerImage { get; set; } = string.Empty;
}

public class K8sDeploymentMetric
{
    public string DeploymentName { get; set; } = string.Empty;
    public string Namespace { get; set; } = string.Empty;
    public int DesiredReplicas { get; set; }
    public int ReadyReplicas { get; set; }
    public int AvailableReplicas { get; set; }
}

public class K8sAlert
{
    public string AlertName { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;   // critical / warning / info
    public string Namespace { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public DateTime FiredAt { get; set; }
}
