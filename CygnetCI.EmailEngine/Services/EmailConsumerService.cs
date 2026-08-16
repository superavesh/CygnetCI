using System.Text.Json;
using CygnetCI.EmailEngine.Models;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace CygnetCI.EmailEngine.Services;

/// <summary>Consumes email jobs from RabbitMQ, processes them, and acks/nacks.
/// Failed sends retry in-process; on final failure they are dead-lettered.</summary>
public class EmailConsumerService : BackgroundService
{
    private readonly EmailEngineOptions _options;
    private readonly EmailProcessor _processor;
    private readonly ILogger<EmailConsumerService> _logger;

    private IConnection? _connection;
    private IModel? _channel;

    public EmailConsumerService(IOptions<EmailEngineOptions> options, EmailProcessor processor,
                                ILogger<EmailConsumerService> logger)
    {
        _options = options.Value;
        _processor = processor;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("CygnetCI EmailEngine starting...");
        await Task.Yield();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (_connection is null || !_connection.IsOpen)
                    Connect();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "RabbitMQ connection failed; retrying in 15s");
            }
            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken).ContinueWith(_ => { });
        }

        Cleanup();
    }

    private void Connect()
    {
        var r = _options.RabbitMQ;
        var factory = new ConnectionFactory
        {
            HostName = r.Host,
            Port = r.Port,
            VirtualHost = r.VirtualHost,
            UserName = r.Username,
            Password = r.Password,
            AutomaticRecoveryEnabled = true,
            DispatchConsumersAsync = false,
        };

        _connection = factory.CreateConnection("CygnetCI.EmailEngine");
        _channel = _connection.CreateModel();

        _channel.ExchangeDeclare(r.Exchange, ExchangeType.Direct, durable: true);
        _channel.QueueDeclare(r.Dlq, durable: true, exclusive: false, autoDelete: false);
        var args = new Dictionary<string, object>
        {
            ["x-dead-letter-exchange"] = "",
            ["x-dead-letter-routing-key"] = r.Dlq,
        };
        _channel.QueueDeclare(r.Queue, durable: true, exclusive: false, autoDelete: false, arguments: args);
        _channel.QueueBind(r.Queue, r.Exchange, r.RoutingKey);
        _channel.BasicQos(0, r.PrefetchCount, false);

        var consumer = new EventingBasicConsumer(_channel);
        consumer.Received += OnReceived;
        _channel.BasicConsume(r.Queue, autoAck: false, consumer);

        _logger.LogInformation("Connected to RabbitMQ {Host}:{Port}, listening on '{Queue}'", r.Host, r.Port, r.Queue);
    }

    private void OnReceived(object? sender, BasicDeliverEventArgs ea)
    {
        var tag = ea.DeliveryTag;
        EmailMessage? msg;
        try
        {
            msg = JsonSerializer.Deserialize<EmailMessage>(ea.Body.Span);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Malformed email message; dead-lettering");
            SafeNack(tag);
            return;
        }

        if (msg is null || msg.To is null || msg.To.Count == 0)
        {
            _logger.LogError("Email message missing recipients; dead-lettering");
            SafeNack(tag);
            return;
        }

        var maxRetries = Math.Max(1, _options.RabbitMQ.MaxRetries);
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                _processor.Process(msg);
                _channel!.BasicAck(tag, false);
                return;
            }
            catch (PermanentEmailException pex)
            {
                _logger.LogError("Permanent failure for '{Template}': {Msg}", msg.Template, pex.Message);
                _processor.LogFailure(msg, pex.Message);
                SafeNack(tag);
                return;
            }
            catch (Exception ex)
            {
                if (attempt >= maxRetries)
                {
                    _logger.LogError(ex, "Send failed after {Attempts} attempts; dead-lettering", attempt);
                    _processor.LogFailure(msg, ex.Message);
                    SafeNack(tag);
                    return;
                }
                _logger.LogWarning("Send attempt {Attempt} failed: {Msg}; retrying", attempt, ex.Message);
                Thread.Sleep(TimeSpan.FromSeconds(2 * attempt));
            }
        }
    }

    private void SafeNack(ulong tag)
    {
        try { _channel?.BasicNack(tag, false, requeue: false); }
        catch (Exception ex) { _logger.LogError(ex, "Failed to nack message"); }
    }

    private void Cleanup()
    {
        try { _channel?.Close(); } catch { /* ignore */ }
        try { _connection?.Close(); } catch { /* ignore */ }
    }

    public override void Dispose()
    {
        Cleanup();
        base.Dispose();
    }
}
