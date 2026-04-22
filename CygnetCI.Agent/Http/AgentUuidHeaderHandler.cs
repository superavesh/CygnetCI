using CygnetCI.Agent.Models;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Http;

/// <summary>
/// DelegatingHandler that injects X-Agent-UUID into every outgoing request.
/// Reads from the shared AgentConfiguration so it picks up the UUID whether it
/// came from appsettings.json or was generated dynamically at first registration.
/// </summary>
public class AgentUuidHeaderHandler : DelegatingHandler
{
    private readonly AgentConfiguration _config;

    public AgentUuidHeaderHandler(IOptions<AgentConfiguration> config)
    {
        _config = config.Value;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(_config.AgentUuid) && !request.Headers.Contains("X-Agent-UUID"))
            request.Headers.TryAddWithoutValidation("X-Agent-UUID", _config.AgentUuid);

        return base.SendAsync(request, ct);
    }
}
