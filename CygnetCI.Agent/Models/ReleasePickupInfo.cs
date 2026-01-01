namespace CygnetCI.Agent.Models;

public class ReleasePickupInfo
{
    public int PickupId { get; set; }
    public int ReleaseExecutionId { get; set; }
    public int StageExecutionId { get; set; }
    public string ReleaseName { get; set; } = string.Empty;
    public string ReleaseNumber { get; set; } = string.Empty;
    public string EnvironmentName { get; set; } = string.Empty;
    public int? PipelineId { get; set; }
    public string? PipelineName { get; set; }
    public List<PipelineStep>? Steps { get; set; }
    public Dictionary<string, string>? Parameters { get; set; }
    public string Status { get; set; } = string.Empty;
    public int Priority { get; set; }
}

public class PipelineStep
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string ScriptContent { get; set; } = string.Empty;
    public Dictionary<string, string>? Configuration { get; set; }
    public int OrderIndex { get; set; }
}
