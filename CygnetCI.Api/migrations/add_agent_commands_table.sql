-- Migration: Add agent_commands table for service control and other agent commands
-- Run this script against your PostgreSQL database

CREATE TABLE IF NOT EXISTS agent_commands (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    command_type VARCHAR(50) NOT NULL,
    command_data TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    result TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    CONSTRAINT check_command_status CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    CONSTRAINT check_command_type CHECK (command_type IN (
        'service_control', 'execute_script', 'system_command',
        'service_log_list', 'service_log_read', 'k8s_onboard', 'k8s_argocd_sync'
    ))
);

-- Create index for faster agent command lookups
CREATE INDEX IF NOT EXISTS idx_agent_commands_agent_id ON agent_commands(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_commands_status ON agent_commands(status);

-- Add comment for documentation
COMMENT ON TABLE agent_commands IS 'Commands queued for agents to execute (e.g., start/stop Windows services)';
