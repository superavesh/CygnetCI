using System.Diagnostics;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Logging;

namespace CygnetCI.Agent.Services;

public class SystemMonitorService : ISystemMonitorService
{
    private readonly ILogger<SystemMonitorService> _logger;
    private readonly PerformanceCounter? _cpuCounter;
    private readonly PerformanceCounter? _ramCounter;
    private int _activeJobs = 0;

    public SystemMonitorService(ILogger<SystemMonitorService> logger)
    {
        _logger = logger;

        try
        {
            if (OperatingSystem.IsWindows())
            {
                _cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total");
                _ramCounter = new PerformanceCounter("Memory", "% Committed Bytes In Use");
                // Initial call to initialize counters
                _cpuCounter.NextValue();
                _ramCounter.NextValue();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to initialize performance counters");
        }
    }

    public SystemMetrics GetSystemMetrics()
    {
        var metrics = new SystemMetrics
        {
            Status = "online",
            ActiveJobs = _activeJobs
        };

        try
        {
            if (OperatingSystem.IsWindows() && _cpuCounter != null && _ramCounter != null)
            {
                metrics.CpuUsage = (int)_cpuCounter.NextValue();
                metrics.MemoryUsage = (int)_ramCounter.NextValue();
            }
            else if (OperatingSystem.IsLinux())
            {
                metrics.CpuUsage = GetLinuxCpuUsage();
                metrics.MemoryUsage = GetLinuxMemoryUsage();
            }

            // Disk: primary drive (C:\ on Windows, / on Linux)
            try
            {
                var driveName = OperatingSystem.IsWindows() ? "C:\\" : "/";
                var drive = System.IO.DriveInfo.GetDrives().FirstOrDefault(d => d.Name == driveName);
                if (drive != null && drive.IsReady)
                {
                    var usedSpace = drive.TotalSize - drive.AvailableFreeSpace;
                    metrics.DiskUsage = (int)((usedSpace * 100) / drive.TotalSize);
                }
            }
            catch (Exception diskEx)
            {
                _logger.LogWarning(diskEx, "Failed to get disk usage");
            }

            metrics.CpuUsage = Math.Clamp(metrics.CpuUsage, 0, 100);
            metrics.MemoryUsage = Math.Clamp(metrics.MemoryUsage, 0, 100);
            metrics.DiskUsage = Math.Clamp(metrics.DiskUsage, 0, 100);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get system metrics");
        }

        return metrics;
    }

    /// <summary>
    /// Reads /proc/stat twice (500ms apart) and computes system-wide CPU usage %.
    /// </summary>
    private int GetLinuxCpuUsage()
    {
        try
        {
            (long idle1, long total1) = ReadProcStatCpu();
            System.Threading.Thread.Sleep(500);
            (long idle2, long total2) = ReadProcStatCpu();

            var totalDelta = total2 - total1;
            var idleDelta = idle2 - idle1;

            if (totalDelta <= 0) return 0;
            return (int)(100L * (totalDelta - idleDelta) / totalDelta);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read Linux CPU usage from /proc/stat");
            return 0;
        }
    }

    private static (long idle, long total) ReadProcStatCpu()
    {
        // First line format: cpu  user nice system idle iowait irq softirq steal guest guest_nice
        var line = System.IO.File.ReadLines("/proc/stat").First(l => l.StartsWith("cpu "));
        var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        long user    = long.Parse(parts[1]);
        long nice    = long.Parse(parts[2]);
        long system  = long.Parse(parts[3]);
        long idle    = long.Parse(parts[4]);
        long iowait  = parts.Length > 5 ? long.Parse(parts[5]) : 0;
        long irq     = parts.Length > 6 ? long.Parse(parts[6]) : 0;
        long softirq = parts.Length > 7 ? long.Parse(parts[7]) : 0;
        long steal   = parts.Length > 8 ? long.Parse(parts[8]) : 0;

        long totalIdle = idle + iowait;
        long total = user + nice + system + idle + iowait + irq + softirq + steal;
        return (totalIdle, total);
    }

    /// <summary>
    /// Reads /proc/meminfo and returns used memory as a percentage of total.
    /// </summary>
    private int GetLinuxMemoryUsage()
    {
        try
        {
            long memTotal = 0, memAvailable = 0;
            foreach (var line in System.IO.File.ReadLines("/proc/meminfo"))
            {
                if (line.StartsWith("MemTotal:"))
                    memTotal = ParseProcMemInfoKb(line);
                else if (line.StartsWith("MemAvailable:"))
                    memAvailable = ParseProcMemInfoKb(line);

                if (memTotal > 0 && memAvailable > 0) break;
            }

            if (memTotal <= 0) return 0;
            return (int)(100L * (memTotal - memAvailable) / memTotal);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read Linux memory usage from /proc/meminfo");
            return 0;
        }
    }

    private static long ParseProcMemInfoKb(string line)
    {
        // Format: "MemTotal:       16384000 kB"
        var parts = line.Split(':', StringSplitOptions.TrimEntries);
        return long.TryParse(parts[1].Replace(" kB", "").Trim(), out var val) ? val : 0;
    }

    public void IncrementActiveJobs()
    {
        Interlocked.Increment(ref _activeJobs);
    }

    public void DecrementActiveJobs()
    {
        Interlocked.Decrement(ref _activeJobs);
    }
}
