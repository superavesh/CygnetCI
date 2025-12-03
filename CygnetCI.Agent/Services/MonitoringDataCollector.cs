using System.Diagnostics;
using System.Management.Automation;
using System.ServiceProcess;
using CygnetCI.Agent.Http;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Services;

public interface IMonitoringDataCollector
{
    MonitoringData CollectMonitoringData();
}

public class MonitoringDataCollector : IMonitoringDataCollector
{
    private readonly ILogger<MonitoringDataCollector> _logger;
    private readonly AgentConfiguration _config;

    public MonitoringDataCollector(
        ILogger<MonitoringDataCollector> logger,
        IOptions<AgentConfiguration> config)
    {
        _logger = logger;
        _config = config.Value;
    }

    public MonitoringData CollectMonitoringData()
    {
        var data = new MonitoringData();

        try
        {
            data.WindowsServices = GetWindowsServices();
            data.Drives = GetDriveInfo();
            data.WebsitePings = GetWebsitePings();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to collect monitoring data");
        }

        return data;
    }

    private List<WindowsServiceInfo> GetWindowsServices()
    {
        var services = new List<WindowsServiceInfo>();

        try
        {
            if (!OperatingSystem.IsWindows())
                return services;

            // Get all services starting with "CI"
            var allServices = ServiceController.GetServices();
            foreach (var service in allServices)
            {
                try
                {
                    if (service.ServiceName.StartsWith("CI", StringComparison.OrdinalIgnoreCase))
                    {
                        services.Add(new WindowsServiceInfo
                        {
                            Name = service.ServiceName,
                            DisplayName = service.DisplayName,
                            Status = service.Status.ToString(),
                            Description = service.DisplayName
                        });
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to get info for service {ServiceName}", service.ServiceName);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get Windows services");
        }

        return services;
    }

    private List<Models.DriveInfo> GetDriveInfo()
    {
        var drives = new List<Models.DriveInfo>();

        try
        {
            foreach (var drive in System.IO.DriveInfo.GetDrives())
            {
                try
                {
                    if (!drive.IsReady)
                        continue;

                    var totalGB = drive.TotalSize / (1024 * 1024 * 1024);
                    var freeGB = drive.AvailableFreeSpace / (1024 * 1024 * 1024);
                    var usedGB = totalGB - freeGB;
                    var percentUsed = totalGB > 0 ? (int)((usedGB * 100) / totalGB) : 0;

                    drives.Add(new Models.DriveInfo
                    {
                        Letter = drive.Name,
                        Label = string.IsNullOrEmpty(drive.VolumeLabel) ? drive.Name : drive.VolumeLabel,
                        TotalGB = totalGB,
                        UsedGB = usedGB,
                        FreeGB = freeGB,
                        PercentUsed = percentUsed
                    });
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to get info for drive {DriveName}", drive.Name);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get drive information");
        }

        return drives;
    }

    private List<WebsitePingInfo> GetWebsitePings()
    {
        var pings = new List<WebsitePingInfo>();

        try
        {
            // Default URLs to ping - can be configured later
            var urlsToPing = new List<(string Name, string Url)>
            {
                ("CygnetCI API", "http://localhost:8000/health"),
                ("CygnetCI Web", "http://localhost:3000")
            };

            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(5);

            foreach (var (name, url) in urlsToPing)
            {
                try
                {
                    var stopwatch = Stopwatch.StartNew();
                    var response = httpClient.GetAsync(url).Result;
                    stopwatch.Stop();

                    pings.Add(new WebsitePingInfo
                    {
                        Url = url,
                        Name = name,
                        Status = response.IsSuccessStatusCode ? "healthy" : "unhealthy",
                        ResponseTimeMs = (int)stopwatch.ElapsedMilliseconds,
                        LastChecked = DateTime.Now
                    });
                }
                catch
                {
                    pings.Add(new WebsitePingInfo
                    {
                        Url = url,
                        Name = name,
                        Status = "unhealthy",
                        ResponseTimeMs = 0,
                        LastChecked = DateTime.Now
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to ping websites");
        }

        return pings;
    }
}
