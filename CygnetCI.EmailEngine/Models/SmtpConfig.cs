using System.Xml.Linq;

namespace CygnetCI.EmailEngine.Models;

/// <summary>SMTP provider config parsed from the app_settings 'smtp' XML value.</summary>
public class SmtpConfig
{
    public string Type { get; set; } = "smtp";   // smtp | sendgrid | gcp-oauth
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public bool UseStartTls { get; set; } = true;

    // sendgrid
    public string ApiKey { get; set; } = "";

    // gcp-oauth
    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public string RefreshToken { get; set; } = "";
    public string User { get; set; } = "";

    public string FromName { get; set; } = "CygnetCI";
    public string FromAddress { get; set; } = "no-reply@localhost";

    public static SmtpConfig Parse(string xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
            throw new PermanentEmailException("SMTP config (app_settings 'smtp') is empty.");

        XElement root;
        try { root = XElement.Parse(xml); }
        catch (Exception ex) { throw new PermanentEmailException($"SMTP config XML is invalid: {ex.Message}"); }

        string S(string name) => root.Element(name)?.Value?.Trim() ?? "";
        int I(string name, int def) => int.TryParse(root.Element(name)?.Value, out var v) ? v : def;
        bool B(string name, bool def) => bool.TryParse(root.Element(name)?.Value, out var v) ? v : def;

        var cfg = new SmtpConfig
        {
            Type = (root.Attribute("type")?.Value ?? "smtp").Trim().ToLowerInvariant(),
            Host = S("host"),
            Port = I("port", 587),
            Username = S("username"),
            Password = S("password"),
            UseStartTls = B("useStartTls", true),
            ApiKey = S("apiKey"),
            ClientId = S("clientId"),
            ClientSecret = S("clientSecret"),
            RefreshToken = S("refreshToken"),
            User = S("user"),
        };

        var from = root.Element("from");
        if (from != null)
        {
            cfg.FromName = from.Attribute("name")?.Value?.Trim() ?? cfg.FromName;
            cfg.FromAddress = from.Attribute("address")?.Value?.Trim() ?? cfg.FromAddress;
        }
        return cfg;
    }
}
