using CygnetCI.EmailEngine.Models;
using Dapper;
using Microsoft.Extensions.Options;
using Npgsql;

namespace CygnetCI.EmailEngine.Services;

public record EmailTemplateRow(string Name, string Subject, string HtmlBody, string? TextBody);

public interface ISettingsRepository
{
    string? GetSetting(string key);
    EmailTemplateRow? GetTemplate(string name);
    bool AlreadySent(string? idempotencyKey);
    void LogResult(string recipient, string? type, string? template, string? subject,
                   string? provider, string status, string? error, string? messageId, string? idempotencyKey);
}

public class SettingsRepository : ISettingsRepository
{
    private readonly string _connectionString;

    public SettingsRepository(IOptions<EmailEngineOptions> options)
    {
        _connectionString = options.Value.Database.ConnectionString;
    }

    private NpgsqlConnection Open()
    {
        var conn = new NpgsqlConnection(_connectionString);
        conn.Open();
        return conn;
    }

    public string? GetSetting(string key)
    {
        using var conn = Open();
        return conn.QueryFirstOrDefault<string?>(
            "SELECT value FROM app_settings WHERE key = @key", new { key });
    }

    public EmailTemplateRow? GetTemplate(string name)
    {
        using var conn = Open();
        return conn.QueryFirstOrDefault<EmailTemplateRow>(
            @"SELECT name AS Name, subject AS Subject, html_body AS HtmlBody, text_body AS TextBody
              FROM email_templates WHERE name = @name", new { name });
    }

    public bool AlreadySent(string? idempotencyKey)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey)) return false;
        using var conn = Open();
        var count = conn.ExecuteScalar<int>(
            "SELECT COUNT(*) FROM email_log WHERE idempotency_key = @k AND status = 'sent'",
            new { k = idempotencyKey });
        return count > 0;
    }

    public void LogResult(string recipient, string? type, string? template, string? subject,
                          string? provider, string status, string? error, string? messageId, string? idempotencyKey)
    {
        using var conn = Open();
        // Upsert on the partial unique index (idempotency_key WHERE NOT NULL) so retries
        // update the same row instead of colliding. Rows with a NULL key always insert.
        conn.Execute(
            @"INSERT INTO email_log
                (recipient, email_type, template, subject, provider, status, error, message_id, idempotency_key, created_at, sent_at)
              VALUES
                (@recipient, @type, @template, @subject, @provider, @status, @error, @messageId, @idempotencyKey, NOW(),
                 CASE WHEN @status = 'sent' THEN NOW() ELSE NULL END)
              ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
              DO UPDATE SET
                status    = EXCLUDED.status,
                error     = EXCLUDED.error,
                provider  = EXCLUDED.provider,
                subject   = EXCLUDED.subject,
                message_id= EXCLUDED.message_id,
                sent_at   = CASE WHEN EXCLUDED.status = 'sent' THEN NOW() ELSE email_log.sent_at END",
            new { recipient, type, template, subject, provider, status, error, messageId, idempotencyKey });
    }
}
