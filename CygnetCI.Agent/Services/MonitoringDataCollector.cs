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
        if (OperatingSystem.IsWindows())
            return GetWindowsServicesInternal();

        if (OperatingSystem.IsLinux())
            return GetLinuxServicesInternal();

        return new List<WindowsServiceInfo>();
    }

    private List<WindowsServiceInfo> GetWindowsServicesInternal()
    {
        var services = new List<WindowsServiceInfo>();
        try
        {
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

    /// <summary>
    /// Runs `systemctl list-units --type=service` and parses the output
    /// into the same WindowsServiceInfo structure used by the UI.
    /// Returns all loaded systemd services (same scope as Windows "all services").
    /// </summary>
    private List<WindowsServiceInfo> GetLinuxServicesInternal()
    {
        var services = new List<WindowsServiceInfo>();
        try
        {
            using var process = new System.Diagnostics.Process();
            process.StartInfo = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "systemctl",
                // --no-pager --no-legend: plain output, no headers/footers
                // --type=service --state=loaded: all loaded services (running + stopped)
                Arguments = "list-units --type=service --state=loaded --no-pager --no-legend",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            process.Start();
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit(5000);

            // Each line: "  cygnetci-agent.service  loaded active running  CygnetCI Agent"
            // Fields (space-separated, variable widths): UNIT LOAD ACTIVE SUB DESCRIPTION
            foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var trimmed = line.Trim();
                if (string.IsNullOrWhiteSpace(trimmed)) continue;

                var parts = trimmed.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 4) continue;

                var unitName = parts[0]; // e.g. "nginx.service"
                var active   = parts[2]; // "active" | "inactive" | "failed"
                var sub      = parts[3]; // "running" | "exited" | "dead" | "failed"
                var description = parts.Length > 4
                    ? string.Join(" ", parts[4..])
                    : unitName;

                // Normalise status to match the Windows values the UI already handles
                var status = (active, sub) switch
                {
                    ("active", "running") => "Running",
                    ("active", _)         => "Running",
                    ("failed", _)         => "Stopped",
                    _                     => "Stopped"
                };

                // Strip ".service" suffix for a cleaner display name
                var displayName = unitName.EndsWith(".service")
                    ? unitName[..^8]
                    : unitName;

                services.Add(new WindowsServiceInfo
                {
                    Name        = unitName,
                    DisplayName = displayName,
                    Status      = status,
                    Description = description
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get Linux systemd services");
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
            // Get configured URLs from appsettings.json
            var configuredPings = _config.WebsitePings?.Where(p => p.Enabled).ToList() ?? new List<WebsitePingConfig>();

            // If no URLs configured, skip
            if (!configuredPings.Any())
            {
                _logger.LogDebug("No website pings configured");
                return pings;
            }

            using var httpClient = new HttpClient();

            foreach (var pingConfig in configuredPings)
            {
                try
                {
                    // Set timeout from configuration
                    httpClient.Timeout = TimeSpan.FromSeconds(pingConfig.TimeoutSeconds);

                    var stopwatch = Stopwatch.StartNew();
                    var response = httpClient.GetAsync(pingConfig.Url).Result;
                    stopwatch.Stop();

                    pings.Add(new WebsitePingInfo
                    {
                        Url = pingConfig.Url,
                        Name = pingConfig.Name,
                        Status = response.IsSuccessStatusCode ? "healthy" : "unhealthy",
                        ResponseTimeMs = (int)stopwatch.ElapsedMilliseconds,
                        LastChecked = DateTime.Now
                    });

                    _logger.LogDebug("Pinged {Name} ({Url}): {Status} - {ResponseTime}ms",
                        pingConfig.Name, pingConfig.Url, response.IsSuccessStatusCode ? "healthy" : "unhealthy",
                        stopwatch.ElapsedMilliseconds);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to ping {Name} ({Url})", pingConfig.Name, pingConfig.Url);

                    pings.Add(new WebsitePingInfo
                    {
                        Url = pingConfig.Url,
                        Name = pingConfig.Name,
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
