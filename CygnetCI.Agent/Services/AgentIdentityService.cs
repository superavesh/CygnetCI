namespace CygnetCI.Agent.Services;

/// <summary>
/// Stores the agent's own database ID and customer ID after successful registration.
/// Used by SubAgentProxyService to inject parent_agent_id and customer_id into sub-agent registrations.
/// </summary>
public class AgentIdentityService
{
    private int _agentId;
    private int _customerId;

    public int AgentId    => _agentId;
    public int CustomerId => _customerId;

    public void SetAgentId(int id) => _agentId = id;

    public void SetCustomerId(int customerId) => _customerId = customerId;
}
