-- ===================================================
-- ADD TO YOUR EXISTING DATABASE SCHEMA
-- Run these ALTER/CREATE statements
-- ===================================================

-- 1. Add agent_id to pipelines table (to track which agent executes the pipeline)
ALTER TABLE pipelines 
ADD COLUMN agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL;

-- 2. Create pipeline_steps table
CREATE TABLE pipeline_steps (
    id SERIAL PRIMARY KEY,
    pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    command TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_pipeline_step_order UNIQUE(pipeline_id, step_order)
);

CREATE INDEX idx_pipeline_steps_pipeline_id ON pipeline_steps(pipeline_id);
CREATE INDEX idx_pipeline_steps_order ON pipeline_steps(pipeline_id, step_order);

-- 3. Create pipeline_parameters table
CREATE TABLE pipeline_parameters (
    id SERIAL PRIMARY KEY,
    pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    default_value TEXT,
    required BOOLEAN DEFAULT FALSE,
    description TEXT,
    choices JSONB, -- Store array of choices for 'choice' type
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_param_type CHECK (type IN ('string', 'number', 'boolean', 'choice')),
    CONSTRAINT unique_pipeline_param_name UNIQUE(pipeline_id, name)
);

CREATE INDEX idx_pipeline_params_pipeline_id ON pipeline_parameters(pipeline_id);

-- 4. Create pipeline_execution_params table (stores actual values used in each run)
CREATE TABLE pipeline_execution_params (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER NOT NULL REFERENCES pipeline_executions(id) ON DELETE CASCADE,
    param_name VARCHAR(255) NOT NULL,
    param_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_execution_params_execution_id ON pipeline_execution_params(execution_id);

-- 5. Add triggers for updated_at
CREATE TRIGGER update_pipeline_steps_updated_at
    BEFORE UPDATE ON pipeline_steps
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pipeline_params_updated_at
    BEFORE UPDATE ON pipeline_parameters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ===================================================
-- SAMPLE DATA FOR TESTING
-- ===================================================

-- Example: Pipeline with steps and parameters
DO $$
DECLARE
    test_pipeline_id INTEGER;
BEGIN
    -- Insert a test pipeline
    INSERT INTO pipelines (name, description, branch, status, agent_id)
    VALUES ('Deploy Frontend App', 'Deploys the frontend application to specified environment', 'main', 'pending', 1)
    RETURNING id INTO test_pipeline_id;
    
    -- Insert steps
    INSERT INTO pipeline_steps (pipeline_id, name, command, step_order) VALUES
    (test_pipeline_id, 'Install Dependencies', 'npm install', 1),
    (test_pipeline_id, 'Run Tests', 'npm test', 2),
    (test_pipeline_id, 'Build Application', 'npm run build --env={{ENV}}', 3),
    (test_pipeline_id, 'Deploy to Server', 'scp -r dist/ server@{{SERVER}}:/var/www/', 4);
    
    -- Insert parameters
    INSERT INTO pipeline_parameters (pipeline_id, name, type, default_value, required, description, choices) VALUES
    (test_pipeline_id, 'ENV', 'choice', 'staging', true, 'Target environment for deployment', '["dev", "staging", "production"]'::jsonb),
    (test_pipeline_id, 'SERVER', 'string', '192.168.1.100', true, 'Target server IP address', NULL),
    (test_pipeline_id, 'DEBUG', 'boolean', 'false', false, 'Enable debug mode', NULL),
    (test_pipeline_id, 'PORT', 'number', '3000', false, 'Application port', NULL);
END $$;