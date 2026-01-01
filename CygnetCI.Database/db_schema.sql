-- ===================================================
-- CygnetCI Database Schema for PostgreSQL
-- ===================================================

-- Create database
CREATE DATABASE cygnetci;

-- Connect to database
\c cygnetci;

-- ===================================================
-- TABLES
-- ===================================================

-- Agents Table
CREATE TABLE agents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    uuid VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    location VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'offline',
    last_seen TIMESTAMP,
    jobs INTEGER DEFAULT 0,
    cpu INTEGER DEFAULT 0,
    memory INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_status CHECK (status IN ('online', 'offline', 'busy')),
    CONSTRAINT check_cpu CHECK (cpu >= 0 AND cpu <= 100),
    CONSTRAINT check_memory CHECK (memory >= 0 AND memory <= 100)
);

-- Agent Resource Data (Time Series Data)
CREATE TABLE agent_resource_data (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cpu INTEGER NOT NULL,
    memory INTEGER NOT NULL,
    disk INTEGER NOT NULL,
    
    CONSTRAINT check_cpu CHECK (cpu >= 0 AND cpu <= 100),
    CONSTRAINT check_memory CHECK (memory >= 0 AND memory <= 100),
    CONSTRAINT check_disk CHECK (disk >= 0 AND disk <= 100)
);

-- Agent Logs
CREATE TABLE agent_logs (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    level VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    details TEXT,
    
    CONSTRAINT check_log_level CHECK (level IN ('info', 'success', 'warning', 'error'))
);

-- Pipelines Table
CREATE TABLE pipelines (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    branch VARCHAR(255) NOT NULL,
    commit VARCHAR(255),
    last_run TIMESTAMP,
    duration VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_pipeline_status CHECK (status IN ('success', 'failed', 'running', 'pending'))
);

-- Pipeline Executions (History)
CREATE TABLE pipeline_executions (
    id SERIAL PRIMARY KEY,
    pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration VARCHAR(50),
    commit VARCHAR(255),
    triggered_by VARCHAR(255),
    
    CONSTRAINT check_execution_status CHECK (status IN ('success', 'failed', 'running', 'cancelled'))
);

-- Tasks Table
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    pipeline_id INTEGER REFERENCES pipelines(id) ON DELETE SET NULL,
    agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    pipeline_name VARCHAR(255),
    agent_name VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_task_status CHECK (status IN ('completed', 'running', 'queued', 'failed'))
);

-- Services Table
CREATE TABLE services (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    url TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'unknown',
    category VARCHAR(50) NOT NULL DEFAULT 'todo',
    last_check TIMESTAMP,
    response_time VARCHAR(50),
    uptime DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_service_type CHECK (type IN ('website', 'database', 'api', 'service')),
    CONSTRAINT check_service_status CHECK (status IN ('healthy', 'warning', 'critical', 'down', 'unknown')),
    CONSTRAINT check_service_category CHECK (category IN ('todo', 'monitoring', 'issues', 'healthy'))
);

-- Service Health History
CREATE TABLE service_health_history (
    id SERIAL PRIMARY KEY,
    service_id VARCHAR(255) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL,
    response_time VARCHAR(50),
    
    CONSTRAINT check_health_status CHECK (status IN ('healthy', 'warning', 'critical', 'down', 'unknown'))
);

-- Statistics Table (for trends)
CREATE TABLE statistics (
    id SERIAL PRIMARY KEY,
    stat_date DATE NOT NULL UNIQUE,
    active_agents INTEGER DEFAULT 0,
    running_pipelines INTEGER DEFAULT 0,
    success_rate DECIMAL(5, 2) DEFAULT 0.00,
    avg_deploy_time VARCHAR(50),
    total_deployments INTEGER DEFAULT 0,
    successful_deployments INTEGER DEFAULT 0,
    failed_deployments INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_success_rate CHECK (success_rate >= 0 AND success_rate <= 100)
);

-- ===================================================
-- INDEXES
-- ===================================================

-- Agents indexes
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_location ON agents(location);
CREATE INDEX idx_agents_last_seen ON agents(last_seen);

-- Agent resource data indexes
CREATE INDEX idx_agent_resource_agent_id ON agent_resource_data(agent_id);
CREATE INDEX idx_agent_resource_timestamp ON agent_resource_data(timestamp DESC);

-- Agent logs indexes
CREATE INDEX idx_agent_logs_agent_id ON agent_logs(agent_id);
CREATE INDEX idx_agent_logs_timestamp ON agent_logs(timestamp DESC);
CREATE INDEX idx_agent_logs_level ON agent_logs(level);

-- Pipelines indexes
CREATE INDEX idx_pipelines_status ON pipelines(status);
CREATE INDEX idx_pipelines_branch ON pipelines(branch);
CREATE INDEX idx_pipelines_last_run ON pipelines(last_run DESC);

-- Pipeline executions indexes
CREATE INDEX idx_pipeline_executions_pipeline_id ON pipeline_executions(pipeline_id);
CREATE INDEX idx_pipeline_executions_status ON pipeline_executions(status);
CREATE INDEX idx_pipeline_executions_started_at ON pipeline_executions(started_at DESC);

-- Tasks indexes
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_pipeline_id ON tasks(pipeline_id);
CREATE INDEX idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX idx_tasks_start_time ON tasks(start_time DESC);

-- Services indexes
CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_type ON services(type);
CREATE INDEX idx_services_last_check ON services(last_check DESC);

-- Service health history indexes
CREATE INDEX idx_service_health_service_id ON service_health_history(service_id);
CREATE INDEX idx_service_health_timestamp ON service_health_history(timestamp DESC);

-- Statistics indexes
CREATE INDEX idx_statistics_date ON statistics(stat_date DESC);

-- ===================================================
-- FUNCTIONS AND TRIGGERS
-- ===================================================

-- Function to update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pipelines_updated_at
    BEFORE UPDATE ON pipelines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate pipeline duration
CREATE OR REPLACE FUNCTION calculate_duration(
    start_time TIMESTAMP,
    end_time TIMESTAMP
) RETURNS VARCHAR AS $$
DECLARE
    duration_seconds INTEGER;
    minutes INTEGER;
    seconds INTEGER;
BEGIN
    IF start_time IS NULL OR end_time IS NULL THEN
        RETURN '-';
    END IF;
    
    duration_seconds := EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER;
    minutes := duration_seconds / 60;
    seconds := duration_seconds % 60;
    
    RETURN minutes || 'm ' || seconds || 's';
END;
$$ LANGUAGE plpgsql;

-- Function to format relative time (e.g., "5 minutes ago")
CREATE OR REPLACE FUNCTION relative_time(timestamp_value TIMESTAMP)
RETURNS VARCHAR AS $$
DECLARE
    seconds_diff INTEGER;
    minutes_diff INTEGER;
    hours_diff INTEGER;
    days_diff INTEGER;
BEGIN
    IF timestamp_value IS NULL THEN
        RETURN 'never';
    END IF;
    
    seconds_diff := EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - timestamp_value))::INTEGER;
    
    IF seconds_diff < 60 THEN
        RETURN 'just now';
    ELSIF seconds_diff < 3600 THEN
        minutes_diff := seconds_diff / 60;
        RETURN minutes_diff || ' minute' || (CASE WHEN minutes_diff > 1 THEN 's' ELSE '' END) || ' ago';
    ELSIF seconds_diff < 86400 THEN
        hours_diff := seconds_diff / 3600;
        RETURN hours_diff || ' hour' || (CASE WHEN hours_diff > 1 THEN 's' ELSE '' END) || ' ago';
    ELSE
        days_diff := seconds_diff / 86400;
        RETURN days_diff || ' day' || (CASE WHEN days_diff > 1 THEN 's' ELSE '' END) || ' ago';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ===================================================
-- VIEWS
-- ===================================================

-- View for dashboard agents with formatted data
CREATE VIEW dashboard_agents AS
SELECT
    id,
    name,
    status,
    relative_time(last_seen) as last_seen,
    jobs,
    location,
    cpu,
    memory,
    uuid
FROM agents
ORDER BY last_seen DESC;

-- View for dashboard pipelines with formatted data
CREATE VIEW dashboard_pipelines AS
SELECT
    id,
    name,
    status,
    relative_time(last_run) as last_run,
    duration,
    branch,
    commit
FROM pipelines
ORDER BY last_run DESC;

-- View for dashboard tasks
CREATE VIEW dashboard_tasks AS
SELECT
    id,
    name,
    COALESCE(pipeline_name, (SELECT name FROM pipelines WHERE id = pipeline_id)) as pipeline,
    COALESCE(agent_name, (SELECT name FROM agents WHERE id = agent_id)) as agent,
    status,
    TO_CHAR(start_time, 'HH:MI AM') as start_time,
    COALESCE(duration, '-') as duration
FROM tasks
ORDER BY created_at DESC;

-- ===================================================
-- SAMPLE DATA (Optional - for testing)
-- ===================================================

-- Insert sample agents
INSERT INTO agents (name, uuid, location, status, last_seen, jobs, cpu, memory) VALUES
('TotalEnergies', '550e8400-e29b-41d4-a716-446655440001', 'Server-1', 'online', CURRENT_TIMESTAMP - INTERVAL '2 minutes', 3, 45, 67),
('TKM', '550e8400-e29b-41d4-a716-446655440002', 'Server-2', 'online', CURRENT_TIMESTAMP - INTERVAL '1 minute', 1, 23, 43),
('KotakLife', '550e8400-e29b-41d4-a716-446655440003', 'Server-3', 'offline', CURRENT_TIMESTAMP - INTERVAL '15 minutes', 0, 0, 0),
('Indorama', '550e8400-e29b-41d4-a716-446655440004', 'Server-4', 'busy', CURRENT_TIMESTAMP, 2, 78, 89);

-- Insert sample pipelines
INSERT INTO pipelines (name, status, branch, commit, last_run, duration) VALUES
('Frontend Deploy', 'success', 'main', 'abc123f', CURRENT_TIMESTAMP - INTERVAL '5 minutes', '2m 34s'),
('Backend API', 'running', 'develop', 'def456g', CURRENT_TIMESTAMP, '1m 12s'),
('Database Migration', 'failed', 'main', 'ghi789h', CURRENT_TIMESTAMP - INTERVAL '1 hour', '45s'),
('Mobile App Build', 'pending', 'feature/mobile', 'jkl012i', CURRENT_TIMESTAMP - INTERVAL '2 hours', '5m 23s');

-- Insert sample tasks
INSERT INTO tasks (name, pipeline_name, agent_name, status, start_time, duration) VALUES
('Build Docker Image', 'Frontend Deploy', 'Agent-001', 'completed', CURRENT_TIMESTAMP - INTERVAL '10 minutes', '1m 23s'),
('Run Tests', 'Backend API', 'Agent-002', 'running', CURRENT_TIMESTAMP - INTERVAL '5 minutes', '45s'),
('Deploy to Staging', 'Frontend Deploy', 'Agent-001', 'queued', NULL, '-');

-- Insert sample services
INSERT INTO services (id, name, type, url, status, category, last_check, response_time, uptime) VALUES
('svc-1', 'Redis Cache Server', 'database', 'redis://localhost:6379', 'healthy', 'monitoring', CURRENT_TIMESTAMP - INTERVAL '2 minutes', '5ms', 99.9),
('svc-2', 'Production Website', 'website', 'https://www.company.com', 'healthy', 'healthy', CURRENT_TIMESTAMP - INTERVAL '1 minute', '245ms', 99.8),
('svc-3', 'Legacy Database', 'database', 'mysql://legacy-db:3306', 'critical', 'issues', CURRENT_TIMESTAMP - INTERVAL '5 minutes', '5.2s', 87.3),
('svc-4', 'Main Database', 'database', 'postgresql://main-db:5432', 'healthy', 'healthy', CURRENT_TIMESTAMP - INTERVAL '30 seconds', '8ms', 99.99);

-- Insert today's statistics
INSERT INTO statistics (stat_date, active_agents, running_pipelines, success_rate, avg_deploy_time, total_deployments, successful_deployments, failed_deployments)
VALUES (CURRENT_DATE, 3, 2, 94.00, '2m 45s', 100, 94, 6);

-- ===================================================
-- USEFUL QUERIES
-- ===================================================

-- Get all agents with resource data
-- SELECT * FROM dashboard_agents;

-- Get recent agent logs
-- SELECT * FROM agent_logs WHERE agent_id = 1 ORDER BY timestamp DESC LIMIT 50;

-- Get pipeline execution history
-- SELECT * FROM pipeline_executions WHERE pipeline_id = 1 ORDER BY started_at DESC;

-- Get services by category
-- SELECT * FROM services WHERE category = 'healthy' ORDER BY name;

-- Calculate statistics for today
-- SELECT
--     COUNT(*) FILTER (WHERE status = 'online') as active_agents,
--     COUNT(*) FILTER (WHERE status = 'running') as running_pipelines
-- FROM agents;

-- ===================================================
-- GRANTS (Optional - create application user)
-- ===================================================

-- CREATE USER cygnetci_app WITH PASSWORD 'your_secure_password';
-- GRANT CONNECT ON DATABASE cygnetci TO cygnetci_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cygnetci_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cygnetci_app;