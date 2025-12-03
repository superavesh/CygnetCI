namespace CygnetCI.Agent.Services;

public interface IFileTransferService
{
    Task StartAsync(CancellationToken cancellationToken);
}
