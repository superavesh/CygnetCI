-- Pipeline Pickup Table (similar to release_pickup)
-- This table stores pipeline execution requests that agents poll and execute

CREATE TABLE IF NOT EXISTS pipeline_pickup (
    id SERIAL PRIMARY KEY,
    pipeline_execution_id INTEGER NOT NULL,
    pipeline_id INTEGER NOT NULL,
    pipeline_name VARCHAR(255),
    agent_id INTEGER NOT NULL,
    agent_uuid VARCHAR(255) NOT NULL,
    agent_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    picked_up_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    CONSTRAINT fk_pipeline_pickup_execution
        FOREIGN KEY (pipeline_execution_id)
        REFERENCES pipeline_executions(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_pipeline_pickup_pipeline
        FOREIGN KEY (pipeline_id)
        REFERENCES pipelines(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_pipeline_pickup_agent
        FOREIGN KEY (agent_id)
        REFERENCES agents(id)
        ON DELETE CASCADE,

    CONSTRAINT check_pipeline_pickup_status
        CHECK (status IN ('pending', 'picked_up', 'in_progress', 'completed', 'failed', 'cancelled'))
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pipeline_pickup_agent_uuid ON pipeline_pickup(agent_uuid);
CREATE INDEX IF NOT EXISTS idx_pipeline_pickup_status ON pipeline_pickup(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_pickup_created_at ON pipeline_pickup(created_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_pickup_execution ON pipeline_pickup(pipeline_execution_id);

-- Comments
COMMENT ON TABLE pipeline_pickup IS 'Stores pipeline execution requests for agents to pick up and execute';
COMMENT ON COLUMN pipeline_pickup.status IS 'pending, picked_up, in_progress, completed, failed, cancelled';
COMMENT ON COLUMN pipeline_pickup.priority IS 'Higher number = higher priority (0 is default)';
