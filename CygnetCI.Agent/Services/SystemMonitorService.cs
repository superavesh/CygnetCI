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
                // Windows-specific performance counters
                metrics.CpuUsage = (int)_cpuCounter.NextValue();
                metrics.MemoryUsage = (int)_ramCounter.NextValue();
            }
            else
            {
                // Fallback for Linux/macOS - use Process metrics as approximation
                using var currentProcess = Process.GetCurrentProcess();
                metrics.CpuUsage = (int)(currentProcess.TotalProcessorTime.TotalMilliseconds / Environment.ProcessorCount / 10);

                var totalMemory = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
                var usedMemory = GC.GetTotalMemory(false);
                metrics.MemoryUsage = totalMemory > 0 ? (int)((usedMemory * 100) / totalMemory) : 0;
            }

            // Get disk usage for C: drive
            try
            {
                var cDrive = System.IO.DriveInfo.GetDrives().FirstOrDefault(d => d.Name == "C:\\");
                if (cDrive != null && cDrive.IsReady)
                {
                    var usedSpace = cDrive.TotalSize - cDrive.AvailableFreeSpace;
                    metrics.DiskUsage = (int)((usedSpace * 100) / cDrive.TotalSize);
                }
            }
            catch (Exception diskEx)
            {
                _logger.LogWarning(diskEx, "Failed to get disk usage");
            }

            // Clamp values to 0-100 range
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

    public void IncrementActiveJobs()
    {
        Interlocked.Increment(ref _activeJobs);
    }

    public void DecrementActiveJobs()
    {
        Interlocked.Decrement(ref _activeJobs);
    }
}
