using System.Security.Cryptography;
using System.Text;
using CygnetCI.Agent.Models;
using Microsoft.Extensions.Options;

namespace CygnetCI.Agent.Http;

/// <summary>
/// DelegatingHandler that injects HMAC-SHA256 credentials into every outgoing request
/// when ClientId and ClientSecret are configured in appsettings.json.
/// Signature = HMAC-SHA256(key=ClientSecret, message="{ClientId}:{unix_timestamp_minutes}")
///
/// The timestamp uses ServerClockSync's corrected clock rather than the raw local clock, so
/// an inaccurate/unsynchronized system clock on this machine can never desync the signature
/// from the server that verifies it (the server only accepts the current and previous minute).
/// </summary>
public class HmacCredentialHandler : DelegatingHandler
{
    private readonly AgentConfiguration _config;
    private readonly ServerClockSync _clockSync;

    public HmacCredentialHandler(IOptions<AgentConfiguration> config, ServerClockSync clockSync)
    {
        _config = config.Value;
        _clockSync = clockSync;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(_config.ClientId) && !string.IsNullOrEmpty(_config.ClientSecret)
            && !request.Headers.Contains("X-Client-ID"))
        {
            long timestampMinute = _clockSync.UtcNow.ToUnixTimeSeconds() / 60;
            string message = $"{_config.ClientId}:{timestampMinute}";

            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_config.ClientSecret));
            byte[] hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(message));
            string signature = Convert.ToHexString(hash).ToLower();

            request.Headers.TryAddWithoutValidation("X-Client-ID", _config.ClientId);
            request.Headers.TryAddWithoutValidation("X-Client-Signature", signature);
        }

        var response = await base.SendAsync(request, ct);
        _clockSync.UpdateFromResponse(response);
        return response;
    }
}
