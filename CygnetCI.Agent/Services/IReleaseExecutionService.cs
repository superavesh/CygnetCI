namespace CygnetCI.Agent.Services;

public interface IReleaseExecutionService
{
    Task StartAsync(CancellationToken cancellationToken);
}
