using System.Text.Json.Serialization;

namespace CygnetCI.Agent.Models;

public class PipelinePickupInfo
{
    [JsonPropertyName("pickup_id")]
    public int PickupId { get; set; }

    [JsonPropertyName("pipeline_execution_id")]
    public int PipelineExecutionId { get; set; }

    [JsonPropertyName("pipeline_id")]
    public int PipelineId { get; set; }

    [JsonPropertyName("pipeline_name")]
    public string PipelineName { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("priority")]
    public int Priority { get; set; }

    [JsonPropertyName("created_at")]
    public string? CreatedAt { get; set; }

    [JsonPropertyName("parameters")]
    public Dictionary<string, string> Parameters { get; set; } = new();

    [JsonPropertyName("steps")]
    public List<PipelineStepInfo> Steps { get; set; } = new();

    [JsonPropertyName("pipeline")]
    public PipelineInfo? Pipeline { get; set; }
}

public class PipelineStepInfo
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("command")]
    public string Command { get; set; } = string.Empty;

    [JsonPropertyName("order_index")]
    public int OrderIndex { get; set; }

    [JsonPropertyName("shell_type")]
    public string ShellType { get; set; } = "cmd";

    [JsonPropertyName("continue_on_error")]
    public bool ContinueOnError { get; set; }
}

public class PipelineInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("branch")]
    public string? Branch { get; set; }
}
