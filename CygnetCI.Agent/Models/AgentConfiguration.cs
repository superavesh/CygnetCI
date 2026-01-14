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

    // Proxy Configuration
    public ProxySettings Proxy { get; set; } = new ProxySettings();

    // Website/API Health Check Configuration
    public List<WebsitePingConfig> WebsitePings { get; set; } = new List<WebsitePingConfig>();
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

public class WebsitePingConfig
{
    public string Name { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 5;
    public bool Enabled { get; set; } = true;
}
