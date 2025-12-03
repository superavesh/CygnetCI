using CygnetCI.Agent.Models;

namespace CygnetCI.Agent.Services;

public interface ISystemMonitorService
{
    SystemMetrics GetSystemMetrics();
}
