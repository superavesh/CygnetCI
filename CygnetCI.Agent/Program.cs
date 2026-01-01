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

        var config = context.Configuration.GetSection("Agent").Get<AgentConfiguration>()
            ?? new AgentConfiguration();

        // HTTP Client
        services.AddHttpClient<ICygnetApiClient, CygnetApiClient>(client =>
        {
            client.BaseAddress = new Uri(config.ServerUrl);
            client.Timeout = TimeSpan.FromSeconds(30);
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
