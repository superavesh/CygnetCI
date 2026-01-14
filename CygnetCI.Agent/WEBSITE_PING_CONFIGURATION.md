# Website/API Health Check Configuration

The CygnetCI Agent can monitor the health of websites and APIs by periodically pinging configured URLs. This feature allows you to monitor the availability and response time of your critical endpoints.

## Overview

The agent will:
- Ping configured URLs at regular intervals (controlled by `MonitoringIntervalSeconds`)
- Measure response times
- Report status (healthy/unhealthy) to the CygnetCI server
- Support custom timeout values per endpoint
- Enable/disable individual endpoints without removing configuration

## Configuration

Website pings are configured in the `appsettings.json` file under the `Agent` section:

```json
{
  "Agent": {
    "ServerUrl": "http://127.0.0.1:8000",
    "AgentUuid": "your-agent-uuid",
    "AgentName": "YourAgentName",
    "MonitoringIntervalSeconds": 60,

    "WebsitePings": [
      {
        "Name": "CygnetCI API",
        "Url": "http://127.0.0.1:8000/monitoring/api/ping",
        "TimeoutSeconds": 5,
        "Enabled": true
      },
      {
        "Name": "CygnetCI Web",
        "Url": "http://localhost:3000",
        "TimeoutSeconds": 5,
        "Enabled": true
      },
      {
        "Name": "Production API",
        "Url": "https://api.example.com/health",
        "TimeoutSeconds": 10,
        "Enabled": true
      },
      {
        "Name": "External Service",
        "Url": "https://status.thirdparty.com/api/health",
        "TimeoutSeconds": 15,
        "Enabled": false
      }
    ]
  }
}
```

## Configuration Parameters

### WebsitePingConfig Properties

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `Name` | string | Yes | - | Friendly name for the endpoint (displayed in UI) |
| `Url` | string | Yes | - | Full URL to ping (including protocol: http/https) |
| `TimeoutSeconds` | int | No | 5 | Maximum time to wait for response before marking as unhealthy |
| `Enabled` | bool | No | true | Whether to actively monitor this endpoint |

## Examples

### Example 1: Basic HTTP Endpoint
```json
{
  "Name": "Local API",
  "Url": "http://localhost:8000/health",
  "TimeoutSeconds": 5,
  "Enabled": true
}
```

### Example 2: HTTPS Endpoint with Custom Timeout
```json
{
  "Name": "Production API",
  "Url": "https://api.production.com/health",
  "TimeoutSeconds": 15,
  "Enabled": true
}
```

### Example 3: Temporarily Disabled Endpoint
```json
{
  "Name": "Maintenance API",
  "Url": "https://maintenance.example.com/status",
  "TimeoutSeconds": 5,
  "Enabled": false
}
```

### Example 4: Internal Service
```json
{
  "Name": "Database API",
  "Url": "http://10.0.0.5:5432/health",
  "TimeoutSeconds": 3,
  "Enabled": true
}
```

### Example 5: External Third-Party Service
```json
{
  "Name": "Payment Gateway",
  "Url": "https://api.stripe.com/v1/health",
  "TimeoutSeconds": 10,
  "Enabled": true
}
```

## Best Practices

1. **Use Health/Ping Endpoints**: Configure URLs that are specifically designed for health checks rather than regular API endpoints

2. **Set Appropriate Timeouts**:
   - Local services: 3-5 seconds
   - Internal network: 5-10 seconds
   - External services: 10-15 seconds

3. **Monitor Critical Services**: Focus on services that are critical to your CI/CD pipeline

4. **Disable Temporarily**: Use `Enabled: false` instead of removing configuration when services are under maintenance

5. **Clear Naming**: Use descriptive names that clearly identify the service and environment

## How It Works

1. **Collection**: The agent collects ping data at intervals defined by `MonitoringIntervalSeconds`

2. **Ping Process**:
   - Agent makes HTTP GET request to configured URL
   - Measures response time using high-precision stopwatch
   - Checks if response has success status code (2xx)

3. **Status Determination**:
   - `healthy`: Request completed successfully with 2xx status within timeout
   - `unhealthy`: Request failed, timed out, or returned non-2xx status

4. **Reporting**: Results are sent to CygnetCI server with monitoring data and displayed in the UI

## Viewing Results

Results can be viewed in the CygnetCI web interface:
1. Navigate to **Monitoring** page
2. Click on an agent
3. View **Website/API Ping Status** section
4. See status, response time, and last checked timestamp for each endpoint

## Proxy Support

If your agent is configured with a proxy (see `PROXY_CONFIGURATION.md`), website pings will automatically use the configured proxy settings.

## Troubleshooting

### No Data Showing in UI
- Verify `Enabled: true` for the endpoints
- Check agent logs for connection errors
- Ensure `MonitoringIntervalSeconds` is set (default: 60)
- Verify agent is connected to server

### All Endpoints Showing Unhealthy
- Check network connectivity from agent machine
- Verify URLs are correct and accessible
- Check firewall rules
- Increase `TimeoutSeconds` if services are slow

### Timeout Issues
- Increase `TimeoutSeconds` for slow endpoints
- Check network latency
- Verify target service is responding within expected time

## Security Considerations

1. **Credentials**: Health check endpoints should not require authentication when possible
2. **HTTPS**: Use HTTPS for external services
3. **Internal Only**: Consider monitoring internal health endpoints only
4. **Sensitive URLs**: Be cautious about monitoring URLs that might contain sensitive information

## Related Configuration

- `MonitoringIntervalSeconds`: Controls how often all monitoring data (including pings) is collected
- `Proxy.*`: Proxy configuration affects website ping requests
- See `PROXY_CONFIGURATION.md` for proxy setup

## Limitations

- Only HTTP GET requests are supported
- No custom headers or authentication
- No POST/PUT/DELETE methods
- No request body support

For custom monitoring needs, consider using the API directly or extending the agent functionality.
