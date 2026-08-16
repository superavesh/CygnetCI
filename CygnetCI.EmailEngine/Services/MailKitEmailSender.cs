using System.Net.Http.Json;
using CygnetCI.EmailEngine.Models;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using MimeKit.Utils;

namespace CygnetCI.EmailEngine.Services;

public interface IEmailSender
{
    /// <summary>Sends the email and returns the Message-Id. Throws on failure.</summary>
    string Send(SmtpConfig cfg, string subject, string htmlBody, string? textBody,
                IEnumerable<string> to, IEnumerable<string> cc);
}

/// <summary>Single sender that supports normal SMTP, SendGrid (SMTP relay) and
/// Google Workspace/Gmail via OAuth2 (XOAUTH2), all through MailKit.</summary>
public class MailKitEmailSender : IEmailSender
{
    private static readonly HttpClient Http = new();

    public string Send(SmtpConfig cfg, string subject, string htmlBody, string? textBody,
                       IEnumerable<string> to, IEnumerable<string> cc)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(cfg.FromName, cfg.FromAddress));

        var recipients = to.Where(a => !string.IsNullOrWhiteSpace(a)).ToList();
        foreach (var addr in recipients) message.To.Add(MailboxAddress.Parse(addr));
        foreach (var addr in cc.Where(a => !string.IsNullOrWhiteSpace(a))) message.Cc.Add(MailboxAddress.Parse(addr));

        if (recipients.Count == 0)
            throw new PermanentEmailException("No valid recipients.");

        message.Subject = subject;
        message.MessageId = MimeUtils.GenerateMessageId();
        var body = new BodyBuilder { HtmlBody = htmlBody };
        if (!string.IsNullOrWhiteSpace(textBody)) body.TextBody = textBody;
        message.Body = body.ToMessageBody();

        var (host, port) = ResolveEndpoint(cfg);
        var secure = ResolveSecurity(cfg, port);

        using var client = new SmtpClient();
        client.Timeout = 30000;
        client.Connect(host, port, secure);

        switch (cfg.Type)
        {
            case "sendgrid":
                client.Authenticate("apikey", cfg.ApiKey);
                break;
            case "gcp-oauth":
                var token = GetGoogleAccessToken(cfg);
                client.Authenticate(new SaslMechanismOAuth2(cfg.User, token));
                break;
            default: // smtp
                if (!string.IsNullOrWhiteSpace(cfg.Username))
                    client.Authenticate(cfg.Username, cfg.Password);
                break;
        }

        client.Send(message);
        client.Disconnect(true);
        return message.MessageId;
    }

    private static (string host, int port) ResolveEndpoint(SmtpConfig cfg) => cfg.Type switch
    {
        "sendgrid" => ("smtp.sendgrid.net", cfg.Port > 0 ? cfg.Port : 587),
        "gcp-oauth" => (string.IsNullOrWhiteSpace(cfg.Host) ? "smtp.gmail.com" : cfg.Host, cfg.Port > 0 ? cfg.Port : 587),
        _ => (cfg.Host, cfg.Port > 0 ? cfg.Port : 587),
    };

    private static SecureSocketOptions ResolveSecurity(SmtpConfig cfg, int port)
    {
        if (cfg.Type is "sendgrid" or "gcp-oauth") return SecureSocketOptions.StartTls;
        if (port == 465) return SecureSocketOptions.SslOnConnect;
        return cfg.UseStartTls ? SecureSocketOptions.StartTls : SecureSocketOptions.Auto;
    }

    private static string GetGoogleAccessToken(SmtpConfig cfg)
    {
        var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = cfg.ClientId,
            ["client_secret"] = cfg.ClientSecret,
            ["refresh_token"] = cfg.RefreshToken,
            ["grant_type"] = "refresh_token",
        });

        var resp = Http.PostAsync("https://oauth2.googleapis.com/token", form).GetAwaiter().GetResult();
        var payload = resp.Content.ReadFromJsonAsync<GoogleTokenResponse>().GetAwaiter().GetResult();
        if (!resp.IsSuccessStatusCode || payload is null || string.IsNullOrEmpty(payload.access_token))
            throw new Exception($"Google OAuth token request failed: {(int)resp.StatusCode}");
        return payload.access_token!;
    }

    private class GoogleTokenResponse
    {
        public string? access_token { get; set; }
        public int expires_in { get; set; }
    }
}
