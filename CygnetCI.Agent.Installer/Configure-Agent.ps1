# Configure-Agent.ps1
# This script updates the appsettings.json with user-provided configuration
# Called by the MSI installer after files are installed

param(
    [Parameter(Mandatory=$true)]
    [string]$InstallPath,

    [Parameter(Mandatory=$true)]
    [string]$ApiUrl,

    [Parameter(Mandatory=$true)]
    [string]$AgentUuid,

    [Parameter(Mandatory=$false)]
    [string]$AgentName = ""
)

$ErrorActionPreference = "Stop"

try {
    $configPath = Join-Path $InstallPath "appsettings.json"

    # Wait for file to be available
    $maxRetries = 10
    $retryCount = 0
    while (-not (Test-Path $configPath) -and $retryCount -lt $maxRetries) {
        Start-Sleep -Seconds 1
        $retryCount++
    }

    if (-not (Test-Path $configPath)) {
        throw "Configuration file not found: $configPath"
    }

    # Read existing configuration
    $config = Get-Content $configPath -Raw | ConvertFrom-Json

    # Update Agent settings
    $config.Agent.ServerUrl = $ApiUrl
    $config.Agent.AgentUuid = $AgentUuid

    # Set agent name (use hostname if not provided)
    if ([string]::IsNullOrWhiteSpace($AgentName)) {
        $config.Agent.AgentName = $env:COMPUTERNAME
    } else {
        $config.Agent.AgentName = $AgentName
    }

    # Update WebsitePings API URL
    if ($config.Agent.WebsitePings -and $config.Agent.WebsitePings.Count -gt 0) {
        $config.Agent.WebsitePings[0].Url = "$ApiUrl/monitoring/api/ping"
    }

    # Save configuration
    $config | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8

    Write-Host "Configuration updated successfully"
    exit 0

} catch {
    Write-Error "Failed to configure agent: $_"
    exit 1
}
