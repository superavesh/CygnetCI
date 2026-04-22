namespace CygnetCI.Agent.Models;

public class AgentConfiguration
{
    public string ServerUrl { get; set; } = "http://localhost:8000";
    public string AgentUuid { get; set; } = string.Empty;
    public string AgentName { get; set; } = Environment.MachineName;
    public string Location { get; set; } = "Default Location";
    public int HeartbeatIntervalSeconds { get; set; } = 30;
    public int MonitoringIntervalSeconds { get; set; } = 60;
    public int TaskPollingIntervalSeconds { get; set; } = 5;
    public int FilePollingIntervalSeconds { get; set; } = 10;
    public int ReleasePollingIntervalSeconds { get; set; } = 10;
    public int PipelinePollingIntervalSeconds { get; set; } = 10;
    public string WorkingDirectory { get; set; } = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "work");
    public string DownloadsDirectory { get; set; } = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "downloads");
    public int MaxConcurrentTasks { get; set; } = 3;
    public int MaxConcurrentReleases { get; set; } = 2;
    public int MaxConcurrentPipelines { get; set; } = 2;
    public int ScriptTimeoutSeconds { get; set; } = 3600;
    public int HttpTimeoutSeconds { get; set; } = 300; // Default 5 minutes — covers large file downloads

    // Proxy Configuration
    public ProxySettings Proxy { get; set; } = new ProxySettings();

    // Sub-agent proxy server (enable on jump server to relay sub-agent requests)
    public SubAgentProxySettings SubAgentProxy { get; set; } = new SubAgentProxySettings();

    // Website/API Health Check Configuration
    public List<WebsitePingConfig> WebsitePings { get; set; } = new List<WebsitePingConfig>();

    // Services to monitor — works on both Windows and Linux
    public MonitoredServicesConfig MonitoredServices { get; set; } = new MonitoredServicesConfig();

    // Kubernetes clusters — each entry configures one cluster with its own ArgoCD + Prometheus endpoints.
    // Multiple clusters are supported: the agent polls each enabled cluster in parallel.
    public List<KubernetesClusterConfig> KubernetesClusters { get; set; } = new();
}

public class ProxySettings
{
    public bool Enabled { get; set; } = false;
    public string Address { get; set; } = string.Empty;
    public int Port { get; set; } = 8080;
    public bool UseDefaultCredentials { get; set; } = false;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string[] BypassList { get; set; } = Array.Empty<string>();
    public bool BypassOnLocal { get; set; } = true;
}

public class SubAgentProxySettings
{
    public bool Enabled { get; set; } = false;
    public int Port { get; set; } = 5001;
}

public class WebsitePingConfig
{
    public string Name { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 5;
    public bool Enabled { get; set; } = true;
}

public class MonitoredServicesConfig
{
    /// <summary>
    /// If true, only services listed in <see cref="Names"/> and matching <see cref="Prefixes"/> are shown.
    /// If false, ALL services on the machine are returned (same as the old Linux behaviour).
    /// </summary>
    public bool FilterEnabled { get; set; } = false;

    /// <summary>
    /// Exact service names to include.
    /// Windows example: "W3SVC", "MSSQLSERVER"
    /// Linux example:   "nginx.service", "cygnetci-agent.service"
    /// </summary>
    public List<string> Names { get; set; } = new List<string>();

    /// <summary>
    /// Name prefixes — any service whose name starts with one of these strings is included.
    /// Windows default was "CI". Leave empty to skip prefix matching.
    /// </summary>
    public List<string> Prefixes { get; set; } = new List<string>();
}

// Groups one K8s cluster's ArgoCD + Prometheus config under a friendly name.
public class KubernetesClusterConfig
{
    public string ClusterName { get; set; } = string.Empty;
    public ArgocdSettings ArgoCD { get; set; } = new ArgocdSettings();
    public PrometheusSettings Prometheus { get; set; } = new PrometheusSettings();
}

public class ArgocdSettings
{
    public bool Enabled { get; set; } = false;
    public string ServerUrl { get; set; } = string.Empty;
    public string Token { get; set; } = string.Empty;
    public bool InsecureSkipTlsVerify { get; set; } = false;
    public int SyncTimeoutSeconds { get; set; } = 300;
    public int SyncPollIntervalSeconds { get; set; } = 5;
}

public class PrometheusSettings
{
    public bool Enabled { get; set; } = false;
    public string Url { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;    // optional basic auth
    public string Password { get; set; } = string.Empty;
    public int QueryIntervalSeconds { get; set; } = 60;
    public List<string> Namespaces { get; set; } = new List<string>();  // empty = all namespaces
}
