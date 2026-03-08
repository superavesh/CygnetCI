namespace CygnetCI.Agent.Services;

/// <summary>
/// Stores the agent's own database ID after successful registration.
/// Used by SubAgentProxyService to inject parent_agent_id into sub-agent registrations.
/// </summary>
public class AgentIdentityService
{
    private int _agentId;

    public int AgentId => _agentId;

    public void SetAgentId(int id)
    {
        _agentId = id;
    }
}
