namespace CygnetCI.Agent.Services;

public interface ITaskExecutionService
{
    Task StartAsync(CancellationToken cancellationToken);
}
