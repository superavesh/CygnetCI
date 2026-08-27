using System.Threading;

namespace CygnetCI.Agent.Http;

/// <summary>
/// Tracks a running estimate of (server time - local machine time), learned from the
/// standard HTTP "Date" response header on every API call. HmacCredentialHandler uses this
/// offset instead of the raw local clock when computing signature timestamps, so an
/// inaccurate or unsynchronized system clock on the agent host can never desync the HMAC
/// signature window from the server that verifies it.
/// </summary>
public class ServerClockSync
{
    private long _offsetTicks; // TimeSpan.Ticks, updated via Interlocked for thread safety

    /// <summary>Best current estimate of (server UTC now) - (local UTC now).</summary>
    public TimeSpan Offset => new TimeSpan(Interlocked.Read(ref _offsetTicks));

    /// <summary>Local clock corrected by the learned offset — use this instead of DateTimeOffset.UtcNow
    /// for anything that must agree with the server's clock.</summary>
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow + Offset;

    /// <summary>Call after every API response to keep the offset fresh.</summary>
    public void UpdateFromResponse(HttpResponseMessage response)
    {
        var serverDate = response.Headers.Date;
        if (serverDate is null)
            return;

        var offset = serverDate.Value - DateTimeOffset.UtcNow;
        Interlocked.Exchange(ref _offsetTicks, offset.Ticks);
    }
}
