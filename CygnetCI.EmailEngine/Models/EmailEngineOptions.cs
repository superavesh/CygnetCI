namespace CygnetCI.EmailEngine.Models;

public class EmailEngineOptions
{
    public DatabaseOptions Database { get; set; } = new();
    public RabbitMqOptions RabbitMQ { get; set; } = new();
}

public class DatabaseOptions
{
    public string ConnectionString { get; set; } = "";
}

public class RabbitMqOptions
{
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 5672;
    public string VirtualHost { get; set; } = "/";
    public string Username { get; set; } = "guest";
    public string Password { get; set; } = "guest";
    public string Exchange { get; set; } = "cygnetci.email";
    public string Queue { get; set; } = "email.send";
    public string Dlq { get; set; } = "email.send.dlq";
    public string RoutingKey { get; set; } = "email.send";
    public ushort PrefetchCount { get; set; } = 10;
    public int MaxRetries { get; set; } = 3;
}
