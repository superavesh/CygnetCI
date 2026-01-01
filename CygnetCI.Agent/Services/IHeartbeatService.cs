namespace CygnetCI.Agent.Services;

public interface IHeartbeatService
{
    Task StartAsync(CancellationToken cancellationToken);
}
