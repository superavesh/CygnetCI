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
}
