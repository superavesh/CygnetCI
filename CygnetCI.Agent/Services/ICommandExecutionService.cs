namespace CygnetCI.Agent.Services;

public interface ICommandExecutionService
{
    Task StartAsync(CancellationToken cancellationToken);
}
