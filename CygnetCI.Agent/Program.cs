using CygnetCI.Agent;
using CygnetCI.Agent.Http;
using CygnetCI.Agent.Models;
using CygnetCI.Agent.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = Host.CreateDefaultBuilder(args)
    .ConfigureServices((context, services) =>
    {
        // Configuration
        services.Configure<AgentConfiguration>(
            context.Configuration.GetSection("Agent"));

        // Resolve relative paths to absolute paths based on application directory
        // This is important when running as a Windows Service where the working directory is C:\Windows\System32
        var appBaseDir = AppDomain.CurrentDomain.BaseDirectory;
        services.PostConfigure<AgentConfiguration>(config =>
        {
            // Resolve WorkingDirectory
            if (!Path.IsPathRooted(config.WorkingDirectory))
            {
                config.WorkingDirectory = Path.Combine(appBaseDir, config.WorkingDirectory);
            }

            // Resolve DownloadsDirectory
            if (!Path.IsPathRooted(config.DownloadsDirectory))
            {
                config.DownloadsDirectory = Path.Combine(appBaseDir, config.DownloadsDirectory);
            }
        });

        var config = context.Configuration.GetSection("Agent").Get<AgentConfiguration>()
            ?? new AgentConfiguration();

        // Also resolve paths for the local config instance used during setup
        if (!Path.IsPathRooted(config.WorkingDirectory))
        {
            config.WorkingDirectory = Path.Combine(appBaseDir, config.WorkingDirectory);
        }
        if (!Path.IsPathRooted(config.DownloadsDirectory))
        {
            config.DownloadsDirectory = Path.Combine(appBaseDir, config.DownloadsDirectory);
        }

        // HTTP Client with Proxy Support
        services.AddHttpClient<ICygnetApiClient, CygnetApiClient>(client =>
        {
            client.BaseAddress = new Uri(config.ServerUrl);
            client.Timeout = TimeSpan.FromSeconds(config.HttpTimeoutSeconds);
        })
        .ConfigurePrimaryHttpMessageHandler(() =>
        {
            var handler = new HttpClientHandler();

            // Configure proxy if enabled
            if (config.Proxy.Enabled && !string.IsNullOrWhiteSpace(config.Proxy.Address))
            {
                var proxyUri = new Uri($"http://{config.Proxy.Address}:{config.Proxy.Port}");

                handler.Proxy = new System.Net.WebProxy(proxyUri)
                {
                    BypassProxyOnLocal = config.Proxy.BypassOnLocal,
                    BypassList = config.Proxy.BypassList
                };

                // Configure proxy credentials
                if (config.Proxy.UseDefaultCredentials)
                {
                    handler.Proxy.Credentials = System.Net.CredentialCache.DefaultCredentials;
                }
                else if (!string.IsNullOrWhiteSpace(config.Proxy.Username))
                {
                    handler.Proxy.Credentials = new System.Net.NetworkCredential(
                        config.Proxy.Username,
                        config.Proxy.Password
                    );
                }

                handler.UseProxy = true;
            }
            else
            {
                handler.UseProxy = false;
            }

            return handler;
        });

        // Services
        services.AddSingleton<AgentIdentityService>();
        services.AddSingleton<ISystemMonitorService, SystemMonitorService>();
        services.AddSingleton<IHeartbeatService, HeartbeatService>();
        services.AddSingleton<IMonitoringDataCollector, MonitoringDataCollector>();
        services.AddSingleton<IMonitoringReportService, MonitoringReportService>();
        services.AddSingleton<ITaskExecutionService, TaskExecutionService>();
        services.AddSingleton<IFileTransferService, FileTransferService>();
        services.AddSingleton<IReleaseExecutionService, ReleaseExecutionService>();
        services.AddSingleton<IPipelineExecutionService, PipelineExecutionService>();
        services.AddSingleton<ICommandExecutionService, CommandExecutionService>();

        // Sub-agent proxy (only when enabled in config)
        if (config.SubAgentProxy.Enabled)
        {
            services.AddHostedService<SubAgentProxyService>();
        }

        // ArgoCD service (only when at least one cluster has ArgoCD enabled)
        if (config.KubernetesClusters.Any(c => c.ArgoCD.Enabled && !string.IsNullOrWhiteSpace(c.ArgoCD.ServerUrl)))
        {
            services.AddSingleton<IArgocdService, ArgocdService>();
        }

        // Prometheus K8s metrics polling (only when at least one cluster has Prometheus enabled)
        if (config.KubernetesClusters.Any(c => c.Prometheus.Enabled && !string.IsNullOrWhiteSpace(c.Prometheus.Url)))
        {
            services.AddHostedService<PrometheusService>();
        }

        // Main worker
        services.AddHostedService<AgentWorker>();
    })
    .UseWindowsService(options =>
    {
        options.ServiceName = "CygnetCI Agent";
    })
    .UseSystemd();

await builder.Build().RunAsync();
