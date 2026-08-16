using CygnetCI.EmailEngine.Models;
using Microsoft.Extensions.Logging;

namespace CygnetCI.EmailEngine.Services;

/// <summary>Renders a template and sends one email, recording the outcome in email_log.</summary>
public class EmailProcessor
{
    private readonly ISettingsRepository _repo;
    private readonly ITemplateRenderer _renderer;
    private readonly IEmailSender _sender;
    private readonly ILogger<EmailProcessor> _logger;

    public EmailProcessor(ISettingsRepository repo, ITemplateRenderer renderer,
                          IEmailSender sender, ILogger<EmailProcessor> logger)
    {
        _repo = repo;
        _renderer = renderer;
        _sender = sender;
        _logger = logger;
    }

    public void Process(EmailMessage msg)
    {
        if (_repo.AlreadySent(msg.IdempotencyKey))
        {
            _logger.LogInformation("Skipping already-sent email (idempotency_key={Key})", msg.IdempotencyKey);
            return;
        }

        var templateName = !string.IsNullOrWhiteSpace(msg.Template) ? msg.Template!
                          : (!string.IsNullOrWhiteSpace(msg.Type) ? msg.Type! : "generic");
        var tpl = _repo.GetTemplate(templateName)
                  ?? throw new PermanentEmailException($"Template '{templateName}' not found");

        var data = msg.DataAsObjects();
        var subject = !string.IsNullOrWhiteSpace(msg.Subject) ? msg.Subject! : _renderer.Render(tpl.Subject, data);
        var html = _renderer.Render(tpl.HtmlBody, data);
        var text = string.IsNullOrEmpty(tpl.TextBody) ? null : _renderer.Render(tpl.TextBody!, data);

        var smtpXml = _repo.GetSetting("smtp")
                      ?? throw new PermanentEmailException("SMTP config (app_settings 'smtp') is not set");
        var cfg = SmtpConfig.Parse(smtpXml);

        var messageId = _sender.Send(cfg, subject, html, text, msg.To, msg.Cc);

        _repo.LogResult(string.Join(",", msg.To), msg.Type, templateName, subject,
                        cfg.Type, "sent", null, messageId, msg.IdempotencyKey);
        _logger.LogInformation("Sent '{Template}' to {To} via {Provider}", templateName, string.Join(",", msg.To), cfg.Type);
    }

    public void LogFailure(EmailMessage msg, string error)
    {
        string? provider = null;
        try
        {
            var xml = _repo.GetSetting("smtp");
            if (!string.IsNullOrWhiteSpace(xml)) provider = SmtpConfig.Parse(xml!).Type;
        }
        catch { /* ignore */ }

        _repo.LogResult(string.Join(",", msg.To ?? new List<string>()), msg.Type, msg.Template,
                        msg.Subject, provider, "failed", error, null, msg.IdempotencyKey);
    }
}
