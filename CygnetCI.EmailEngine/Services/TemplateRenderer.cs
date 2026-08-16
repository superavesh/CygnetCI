using System.Text.RegularExpressions;

namespace CygnetCI.EmailEngine.Services;

public interface ITemplateRenderer
{
    string Render(string template, IDictionary<string, object?> data);
}

/// <summary>Lightweight placeholder renderer. Replaces {{ key }} (any whitespace)
/// with the matching value from `data`. No logic/loops — templates are simple by
/// design, which keeps this dependency-free and avoids template-injection risk.</summary>
public class SimpleTemplateRenderer : ITemplateRenderer
{
    private static readonly Regex Placeholder = new(@"\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}", RegexOptions.Compiled);

    public string Render(string template, IDictionary<string, object?> data)
    {
        if (string.IsNullOrEmpty(template)) return "";
        return Placeholder.Replace(template, match =>
        {
            var key = match.Groups[1].Value;
            return data.TryGetValue(key, out var value) && value is not null
                ? value.ToString() ?? ""
                : "";
        });
    }
}
