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
            client.Timeout = TimeSpan.FromSeconds(30);
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
        services.AddSingleton<ISystemMonitorService, SystemMonitorService>();
        services.AddSingleton<IHeartbeatService, HeartbeatService>();
        services.AddSingleton<IMonitoringDataCollector, MonitoringDataCollector>();
        services.AddSingleton<IMonitoringReportService, MonitoringReportService>();
        services.AddSingleton<ITaskExecutionService, TaskExecutionService>();
        services.AddSingleton<IFileTransferService, FileTransferService>();
        services.AddSingleton<IReleaseExecutionService, ReleaseExecutionService>();
        services.AddSingleton<IPipelineExecutionService, PipelineExecutionService>();

        // Main worker
        services.AddHostedService<AgentWorker>();
    })
    .UseWindowsService(options =>
    {
        options.ServiceName = "CygnetCI Agent";
    })
    .UseSystemd();

await builder.Build().RunAsync();
