using CygnetCI.EmailEngine.Models;
using CygnetCI.EmailEngine.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = Host.CreateDefaultBuilder(args)
    .ConfigureServices((context, services) =>
    {
        services.Configure<EmailEngineOptions>(context.Configuration.GetSection("EmailEngine"));

        services.AddSingleton<ISettingsRepository, SettingsRepository>();
        services.AddSingleton<ITemplateRenderer, SimpleTemplateRenderer>();
        services.AddSingleton<IEmailSender, MailKitEmailSender>();
        services.AddSingleton<EmailProcessor>();

        services.AddHostedService<EmailConsumerService>();
    })
    .UseWindowsService(options =>
    {
        options.ServiceName = "CygnetCI EmailEngine";
    })
    .UseSystemd();

await builder.Build().RunAsync();
