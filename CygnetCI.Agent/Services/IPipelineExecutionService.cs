namespace CygnetCI.Agent.Services;

public interface IPipelineExecutionService
{
    Task StartAsync(CancellationToken cancellationToken);
}
