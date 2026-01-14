# CygnetCI Agent - Proxy Configuration Guide

## Overview

The CygnetCI Agent now supports routing all HTTP/HTTPS API calls through a proxy server. This is useful for environments where internet access is restricted and requires proxy authentication.

## Supported Proxy Types

The agent supports the following proxy configurations:

1. **HTTP/HTTPS Proxy** - Standard web proxies
2. **Authenticated Proxies** - Proxies requiring username/password
3. **Windows Integrated Authentication** - Proxies using default Windows credentials
4. **Bypass Lists** - Ability to bypass proxy for specific domains/addresses

## Configuration

All proxy settings are configured in the `appsettings.json` file under the `Agent.Proxy` section.

### Configuration Schema

```json
{
  "Agent": {
    "ServerUrl": "http://127.0.0.1:8000",
    "AgentUuid": "your-agent-uuid",
    "AgentName": "Your Agent Name",
    // ... other agent settings ...
    "Proxy": {
      "Enabled": false,
      "Address": "",
      "Port": 8080,
      "UseDefaultCredentials": false,
      "Username": "",
      "Password": "",
      "BypassList": [],
      "BypassOnLocal": true
    }
  }
}
```

### Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `Enabled` | boolean | `false` | Enable/disable proxy usage |
| `Address` | string | `""` | Proxy server address (hostname or IP) |
| `Port` | integer | `8080` | Proxy server port |
| `UseDefaultCredentials` | boolean | `false` | Use Windows default credentials for authentication |
| `Username` | string | `""` | Proxy username (if authentication required) |
| `Password` | string | `""` | Proxy password (if authentication required) |
| `BypassList` | array | `[]` | List of addresses to bypass proxy |
| `BypassOnLocal` | boolean | `true` | Bypass proxy for local addresses |

## Configuration Examples

### Example 1: Basic Proxy (No Authentication)

```json
{
  "Agent": {
    "Proxy": {
      "Enabled": true,
      "Address": "proxy.company.com",
      "Port": 8080,
      "UseDefaultCredentials": false,
      "Username": "",
      "Password": "",
      "BypassList": [],
      "BypassOnLocal": true
    }
  }
}
```

### Example 2: Authenticated Proxy with Username/Password

```json
{
  "Agent": {
    "Proxy": {
      "Enabled": true,
      "Address": "proxy.company.com",
      "Port": 3128,
      "UseDefaultCredentials": false,
      "Username": "domain\\username",
      "Password": "your-password",
      "BypassList": [],
      "BypassOnLocal": true
    }
  }
}
```

### Example 3: Windows Integrated Authentication

```json
{
  "Agent": {
    "Proxy": {
      "Enabled": true,
      "Address": "proxy.company.com",
      "Port": 8080,
      "UseDefaultCredentials": true,
      "Username": "",
      "Password": "",
      "BypassList": [],
      "BypassOnLocal": true
    }
  }
}
```

### Example 4: Proxy with Bypass List

```json
{
  "Agent": {
    "Proxy": {
      "Enabled": true,
      "Address": "proxy.company.com",
      "Port": 8080,
      "UseDefaultCredentials": false,
      "Username": "proxyuser",
      "Password": "proxypass",
      "BypassList": [
        "localhost",
        "127.0.0.1",
        "*.internal.company.com",
        "192.168.*"
      ],
      "BypassOnLocal": true
    }
  }
}
```

### Example 5: Corporate Proxy with Full Configuration

```json
{
  "Agent": {
    "ServerUrl": "https://cygnetci-api.company.com",
    "Proxy": {
      "Enabled": true,
      "Address": "corpproxy.company.com",
      "Port": 8080,
      "UseDefaultCredentials": true,
      "Username": "",
      "Password": "",
      "BypassList": [
        "localhost",
        "127.0.0.1",
        "*.company.internal",
        "10.*",
        "192.168.*"
      ],
      "BypassOnLocal": true
    }
  }
}
```

## Security Considerations

### Password Storage

**Warning:** The proxy password is stored in plain text in `appsettings.json`. To improve security:

1. **File Permissions**: Restrict access to `appsettings.json` to only the agent service account
2. **Encrypt Configuration**: Consider using ASP.NET Core's Secret Manager or Azure Key Vault for production
3. **Windows Credentials**: Prefer using `UseDefaultCredentials: true` when possible to avoid storing passwords

### Recommended Practices

1. **Use Service Account**: Run the agent as a dedicated service account with minimal permissions
2. **Restrict File Access**: Set file system permissions on the agent directory
3. **Prefer Integrated Auth**: Use Windows integrated authentication when available
4. **Rotate Credentials**: Regularly rotate proxy credentials if using username/password auth

## Bypass List Patterns

The `BypassList` supports the following patterns:

- **Exact match**: `localhost`, `127.0.0.1`
- **Wildcard domains**: `*.company.com`, `*.internal`
- **IP ranges**: `192.168.*`, `10.*`
- **CIDR notation**: Not currently supported (use wildcard patterns instead)

## Testing Proxy Configuration

After configuring the proxy, verify it works by:

1. **Stop the agent** (if running)
2. **Update `appsettings.json`** with proxy settings
3. **Start the agent**
4. **Check logs** for connection errors:
   - Location: Agent console output or Windows Event Viewer (if running as service)
   - Look for: `RegisterAgentAsync`, `SendHeartbeatAsync`, API connection errors

### Common Issues

**Issue: "Connection refused" or "Proxy authentication failed"**
- Solution: Verify proxy address, port, and credentials are correct

**Issue: "The remote name could not be resolved"**
- Solution: Check DNS resolution through the proxy, verify `Address` is correct

**Issue: Agent connects but some requests fail**
- Solution: Check `BypassList` - ensure required domains are not incorrectly bypassed

**Issue: Timeout errors**
- Solution: Corporate proxies may be slow - increase `client.Timeout` in Program.cs if needed

## Affected Components

The proxy configuration affects all HTTP communication from the agent to the CygnetCI server:

- **Agent Registration** - Initial registration with server
- **Heartbeat Service** - Regular heartbeat messages
- **Task Polling** - Checking for pending tasks
- **File Transfer Service** - Downloading files from server
- **Release Execution Service** - Release execution coordination
- **Pipeline Execution Service** - Pipeline execution coordination
- **Monitoring Report Service** - Sending monitoring data
- **Log Streaming** - Sending execution logs to server

## Disabling Proxy

To disable proxy support:

```json
{
  "Agent": {
    "Proxy": {
      "Enabled": false
    }
  }
}
```

Or simply set `Enabled` to `false`. All other proxy settings will be ignored.

## Implementation Details

### Technical Architecture

The proxy is configured at the `HttpClientHandler` level in `Program.cs`:

```csharp
services.AddHttpClient<ICygnetApiClient, CygnetApiClient>(client =>
{
    client.BaseAddress = new Uri(config.ServerUrl);
    client.Timeout = TimeSpan.FromSeconds(30);
})
.ConfigurePrimaryHttpMessageHandler(() =>
{
    var handler = new HttpClientHandler();

    if (config.Proxy.Enabled && !string.IsNullOrWhiteSpace(config.Proxy.Address))
    {
        var proxyUri = new Uri($"http://{config.Proxy.Address}:{config.Proxy.Port}");
        handler.Proxy = new System.Net.WebProxy(proxyUri)
        {
            BypassProxyOnLocal = config.Proxy.BypassOnLocal,
            BypassList = config.Proxy.BypassList,
            Credentials = // ... credential configuration
        };
        handler.UseProxy = true;
    }

    return handler;
});
```

### Configuration Binding

Proxy settings are automatically bound from `appsettings.json` using the Options pattern:

```csharp
services.Configure<AgentConfiguration>(
    context.Configuration.GetSection("Agent"));
```

The `ProxySettings` class is a nested configuration class within `AgentConfiguration`.

## Support and Troubleshooting

For additional help:

1. Check agent logs for detailed error messages
2. Verify network connectivity to proxy server
3. Test proxy credentials using a web browser or `curl`
4. Ensure firewall allows agent → proxy communication
5. Contact your network administrator for proxy-specific issues

## Version History

- **v1.0** - Initial proxy support implementation
  - HTTP/HTTPS proxy
  - Username/password authentication
  - Windows integrated authentication
  - Bypass lists
  - Local bypass option
