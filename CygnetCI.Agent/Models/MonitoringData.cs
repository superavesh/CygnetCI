namespace CygnetCI.Agent.Models;

public class WindowsServiceInfo
{
    public string Name { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

public class DriveInfo
{
    public string Letter { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public long TotalGB { get; set; }
    public long UsedGB { get; set; }
    public long FreeGB { get; set; }
    public int PercentUsed { get; set; }
}

public class WebsitePingInfo
{
    public string Url { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public int ResponseTimeMs { get; set; }
    public DateTime LastChecked { get; set; }
}

public class MonitoringData
{
    public List<WindowsServiceInfo> WindowsServices { get; set; } = new();
    public List<DriveInfo> Drives { get; set; } = new();
    public List<WebsitePingInfo> WebsitePings { get; set; } = new();
}
