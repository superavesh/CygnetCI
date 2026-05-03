using System.Security.Cryptography;
using System.Text;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Http;

/// <summary>
/// DelegatingHandler that injects HMAC-SHA256 credentials into every outgoing request
/// when ClientId and ClientSecret are configured in appsettings.json.
/// Signature = HMAC-SHA256(key=ClientSecret, message="{ClientId}:{unix_timestamp_minutes}")
/// </summary>
public class HmacCredentialHandler : DelegatingHandler
{
    private readonly AgentConfiguration _config;

    public HmacCredentialHandler(IOptions<AgentConfiguration> config)
    {
        _config = config.Value;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(_config.ClientId) && !string.IsNullOrEmpty(_config.ClientSecret)
            && !request.Headers.Contains("X-Client-ID"))
        {
            long timestampMinute = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 60;
            string message = $"{_config.ClientId}:{timestampMinute}";

            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_config.ClientSecret));
            byte[] hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(message));
            string signature = Convert.ToHexString(hash).ToLower();

            request.Headers.TryAddWithoutValidation("X-Client-ID", _config.ClientId);
            request.Headers.TryAddWithoutValidation("X-Client-Signature", signature);
        }

        return base.SendAsync(request, ct);
    }
}
