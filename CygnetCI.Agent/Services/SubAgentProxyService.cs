using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Services;

/// <summary>
/// Embedded HTTP proxy server that runs on the jump server agent.
/// Sub-agents point their ApiUrl to this proxy instead of the real CygnetCI API.
/// All requests are forwarded transparently to the real API, except POST /agents
/// which has the parent_agent_id injected automatically.
/// </summary>
public class SubAgentProxyService : BackgroundService
{
    private readonly ILogger<SubAgentProxyService> _logger;
    private readonly AgentConfiguration _config;
    private readonly AgentIdentityService _agentIdentity;
    private readonly HttpClient _forwardClient;
    private HttpListener? _listener;

    // Headers that must not be forwarded (hop-by-hop headers)
    private static readonly HashSet<string> _skipRequestHeaders = new(StringComparer.OrdinalIgnoreCase)
    {
        "Host", "Connection", "Transfer-Encoding", "Keep-Alive", "Proxy-Authenticate",
        "Proxy-Authorization", "TE", "Trailers", "Upgrade"
    };

public SubAgentProxyService(
        ILogger<SubAgentProxyService> logger,
        IOptions<AgentConfiguration> config,
        AgentIdentityService agentIdentity)
    {
        _logger = logger;
        _config = config.Value;
        _agentIdentity = agentIdentity;

        // Separate HttpClient that talks directly to the real API (no proxy loop)
        // ServerHandler: disable SSL cert validation to support self-signed certs on internal servers
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
        };
        _forwardClient = new HttpClient(handler)
        {
            BaseAddress = new Uri(_config.ServerUrl),
            Timeout = TimeSpan.FromSeconds(300)  // 5 min — accommodates long-polling endpoints
        };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var port = _config.SubAgentProxy.Port;

        _listener = new HttpListener();
        _listener.Prefixes.Add($"http://*:{port}/");

        try
        {
            _listener.Start();
            _logger.LogInformation("Sub-agent proxy started on port {Port} — forwarding to {RealApi}",
                port, _config.ServerUrl);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start sub-agent proxy on port {Port}. " +
                "On Windows, run: netsh http add urlacl url=http://*:{Port}/ user=Everyone", port, port);
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // GetContextAsync has no CT support; use WhenAny to unblock on shutdown
                var contextTask = _listener.GetContextAsync();
                var shutdownTask = Task.Delay(Timeout.Infinite, stoppingToken);

                var completed = await Task.WhenAny(contextTask, shutdownTask);
                if (completed == shutdownTask)
                    break;

                var context = await contextTask;
                // Handle each request in the background, don't await
                _ = HandleRequestAsync(context, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (HttpListenerException ex) when (stoppingToken.IsCancellationRequested)
            {
                _logger.LogDebug("Proxy listener stopped: {Message}", ex.Message);
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error accepting proxy connection");
            }
        }

        _listener.Stop();
        _listener.Close();
        _logger.LogInformation("Sub-agent proxy stopped");
    }

    private async Task HandleRequestAsync(HttpListenerContext context, CancellationToken ct)
    {
        var req = context.Request;
        var resp = context.Response;

        try
        {
            // Read request body
            string body = string.Empty;
            if (req.HasEntityBody)
            {
                using var reader = new StreamReader(req.InputStream, req.ContentEncoding ?? Encoding.UTF8);
                body = await reader.ReadToEndAsync(ct);
            }

            // Intercept POST /agents to inject parent_agent_id
            var path = req.RawUrl ?? "/";
            if (req.HttpMethod.Equals("POST", StringComparison.OrdinalIgnoreCase) &&
                path.TrimEnd('/').Equals("/agents", StringComparison.OrdinalIgnoreCase))
            {
                body = InjectParentAgentId(body);
            }

            // Build forwarded request
            var targetUrl = _config.ServerUrl.TrimEnd('/') + path;
            var forwardReq = new HttpRequestMessage(new HttpMethod(req.HttpMethod), targetUrl);

            if (!string.IsNullOrEmpty(body))
            {
                // Strip charset/parameters from Content-Type — StringContent only accepts the media type part
                var mediaType = (req.ContentType ?? "application/json").Split(';')[0].Trim();
                forwardReq.Content = new StringContent(body, Encoding.UTF8, mediaType);
            }

            // Copy request headers (skip hop-by-hop and content headers already set)
            var skipForContent = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { "Content-Type", "Content-Length" };

            foreach (string key in req.Headers.Keys)
            {
                if (_skipRequestHeaders.Contains(key) || skipForContent.Contains(key))
                    continue;
                forwardReq.Headers.TryAddWithoutValidation(key, req.Headers[key]);
            }

            // Forward to real API
            var apiResp = await _forwardClient.SendAsync(forwardReq, ct);

            // Write response back to sub-agent
            resp.StatusCode = (int)apiResp.StatusCode;

            if (apiResp.Content.Headers.ContentType != null)
                resp.ContentType = apiResp.Content.Headers.ContentType.ToString();

            var responseBytes = await apiResp.Content.ReadAsByteArrayAsync(ct);
            resp.ContentLength64 = responseBytes.Length;
            await resp.OutputStream.WriteAsync(responseBytes, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling proxy request {Method} {Url}",
                req.HttpMethod, req.RawUrl);

            resp.StatusCode = 502;
            var errorBytes = Encoding.UTF8.GetBytes("{\"detail\":\"Proxy error\"}");
            resp.ContentLength64 = errorBytes.Length;
            resp.ContentType = "application/json";
            await resp.OutputStream.WriteAsync(errorBytes, ct);
        }
        finally
        {
            resp.OutputStream.Close();
        }
    }

    /// <summary>
    /// Injects parent_agent_id and customer_id into the sub-agent registration body.
    /// customer_id is required by the FastAPI /agents endpoint for new agent creation.
    /// </summary>
    private string InjectParentAgentId(string body)
    {
        var parentId   = _agentIdentity.AgentId;
        var customerId = _agentIdentity.CustomerId;

        if (parentId <= 0)
        {
            _logger.LogWarning("Parent agent ID not yet available — sub-agent registration forwarded without parent_agent_id/customer_id");
            return body;
        }

        try
        {
            var jsonObj = string.IsNullOrWhiteSpace(body)
                ? new JsonObject()
                : JsonNode.Parse(body)?.AsObject() ?? new JsonObject();

            jsonObj["parent_agent_id"] = parentId;

            if (customerId > 0)
                jsonObj["customer_id"] = customerId;

            _logger.LogDebug("Injected parent_agent_id={ParentId}, customer_id={CustomerId} into sub-agent registration",
                parentId, customerId);
            return jsonObj.ToJsonString();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to inject parent_agent_id/customer_id into registration body");
            return body;
        }
    }

    public override void Dispose()
    {
        _forwardClient.Dispose();
        _listener?.Close();
        base.Dispose();
    }

    // Handler is disposed by HttpClient
}
