-- Release Pickup Schema for CygnetCI
-- This schema manages release assignments to agents for execution

-- Release Pickup Table
CREATE TABLE IF NOT EXISTS release_pickup (
    id SERIAL PRIMARY KEY,
    release_execution_id INTEGER NOT NULL REFERENCES release_executions(id) ON DELETE CASCADE,
    stage_execution_id INTEGER NOT NULL REFERENCES stage_executions(id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    agent_uuid VARCHAR(255) NOT NULL,
    agent_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'picked_up', 'in_progress', 'completed', 'failed', 'cancelled')),
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    picked_up_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3
);

CREATE INDEX IF NOT EXISTS idx_release_pickup_agent_uuid ON release_pickup(agent_uuid);
CREATE INDEX IF NOT EXISTS idx_release_pickup_status ON release_pickup(status);
CREATE INDEX IF NOT EXISTS idx_release_pickup_created_at ON release_pickup(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_release_pickup_agent_status ON release_pickup(agent_uuid, status);

COMMENT ON TABLE release_pickup IS 'Manages release execution assignments to agents';
COMMENT ON COLUMN release_pickup.status IS 'pending: waiting for agent, picked_up: agent acknowledged, in_progress: executing, completed: finished successfully, failed: execution failed, cancelled: cancelled by user';
