using System.Text.Json;
using System.Text.Json.Serialization;

namespace CygnetCI.EmailEngine.Models;

/// <summary>The JSON job published by the API onto RabbitMQ.</summary>
public class EmailMessage
{
    [JsonPropertyName("type")] public string? Type { get; set; }
    [JsonPropertyName("to")] public List<string> To { get; set; } = new();
    [JsonPropertyName("cc")] public List<string> Cc { get; set; } = new();
    [JsonPropertyName("subject")] public string? Subject { get; set; }
    [JsonPropertyName("template")] public string? Template { get; set; }
    [JsonPropertyName("data")] public Dictionary<string, JsonElement> Data { get; set; } = new();
    [JsonPropertyName("priority")] public string? Priority { get; set; }
    [JsonPropertyName("idempotency_key")] public string? IdempotencyKey { get; set; }

    /// <summary>Flatten the JsonElement data into CLR primitives Scriban can render.</summary>
    public Dictionary<string, object?> DataAsObjects()
    {
        var result = new Dictionary<string, object?>();
        foreach (var kv in Data)
            result[kv.Key] = JsonToClr(kv.Value);
        return result;
    }

    private static object? JsonToClr(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.String => el.GetString(),
        JsonValueKind.Number => el.TryGetInt64(out var l) ? l : el.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Null => null,
        JsonValueKind.Array => el.EnumerateArray().Select(JsonToClr).ToList(),
        JsonValueKind.Object => el.EnumerateObject().ToDictionary(p => p.Name, p => JsonToClr(p.Value)),
        _ => el.ToString(),
    };
}

/// <summary>Thrown for errors that will never succeed on retry (bad template/config).</summary>
public class PermanentEmailException : Exception
{
    public PermanentEmailException(string message) : base(message) { }
}
