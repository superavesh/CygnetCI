-- Execution Logs Schema for CygnetCI
-- This schema stores real-time execution logs for pipelines and releases

-- Pipeline Execution Logs
CREATE TABLE IF NOT EXISTS pipeline_execution_logs (
    id SERIAL PRIMARY KEY,
    pipeline_execution_id INTEGER NOT NULL REFERENCES pipeline_executions(id) ON DELETE CASCADE,
    log_level VARCHAR(20) DEFAULT 'info' CHECK (log_level IN ('debug', 'info', 'warning', 'error', 'success')),
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    step_name VARCHAR(255),
    step_index INTEGER,
    source VARCHAR(50) DEFAULT 'system' CHECK (source IN ('system', 'agent', 'user'))
);

CREATE INDEX IF NOT EXISTS idx_pipeline_execution_logs_execution_id ON pipeline_execution_logs(pipeline_execution_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_execution_logs_timestamp ON pipeline_execution_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_execution_logs_level ON pipeline_execution_logs(log_level);

-- Stage Execution Logs (for Release stages)
CREATE TABLE IF NOT EXISTS stage_execution_logs (
    id SERIAL PRIMARY KEY,
    stage_execution_id INTEGER NOT NULL REFERENCES stage_executions(id) ON DELETE CASCADE,
    log_level VARCHAR(20) DEFAULT 'info' CHECK (log_level IN ('debug', 'info', 'warning', 'error', 'success')),
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    task_name VARCHAR(255),
    source VARCHAR(50) DEFAULT 'system' CHECK (source IN ('system', 'agent', 'user'))
);

CREATE INDEX IF NOT EXISTS idx_stage_execution_logs_execution_id ON stage_execution_logs(stage_execution_id);
CREATE INDEX IF NOT EXISTS idx_stage_execution_logs_timestamp ON stage_execution_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_stage_execution_logs_level ON stage_execution_logs(log_level);

-- Add agent_id to release_stages table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'release_stages' AND column_name = 'agent_id'
    ) THEN
        ALTER TABLE release_stages ADD COLUMN agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_release_stages_agent_id ON release_stages(agent_id);
    END IF;
END $$;

-- Add agent_id to stage_executions table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stage_executions' AND column_name = 'agent_id'
    ) THEN
        ALTER TABLE stage_executions ADD COLUMN agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL;
        ALTER TABLE stage_executions ADD COLUMN agent_name VARCHAR(255);
        CREATE INDEX IF NOT EXISTS idx_stage_executions_agent_id ON stage_executions(agent_id);
    END IF;
END $$;

-- Add agent_id to pipeline_executions table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pipeline_executions' AND column_name = 'agent_id'
    ) THEN
        ALTER TABLE pipeline_executions ADD COLUMN agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL;
        ALTER TABLE pipeline_executions ADD COLUMN agent_name VARCHAR(255);
        CREATE INDEX IF NOT EXISTS idx_pipeline_executions_agent_id ON pipeline_executions(agent_id);
    END IF;
END $$;

COMMENT ON TABLE pipeline_execution_logs IS 'Stores real-time logs for pipeline executions';
COMMENT ON TABLE stage_execution_logs IS 'Stores real-time logs for release stage executions';
