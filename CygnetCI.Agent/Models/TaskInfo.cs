namespace CygnetCI.Agent.Models;

public class TaskInfo
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ScriptPath { get; set; } = string.Empty;
    public string ScriptType { get; set; } = string.Empty;
    public Dictionary<string, string>? EnvironmentVariables { get; set; }
    public int TimeoutSeconds { get; set; } = 3600;
}
