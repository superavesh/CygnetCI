namespace CygnetCI.Agent.Models;

public class SystemMetrics
{
    public int CpuUsage { get; set; }
    public int MemoryUsage { get; set; }
    public int DiskUsage { get; set; }
    public string Status { get; set; } = "online";
    public int ActiveJobs { get; set; }
}
