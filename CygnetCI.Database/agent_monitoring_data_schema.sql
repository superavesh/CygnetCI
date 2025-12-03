-- Agent Monitoring Data Schema
-- Tables for storing Windows services, drive info, and website pings reported by agents

-- Windows Services Table
CREATE TABLE IF NOT EXISTS agent_windows_services (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    service_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    description TEXT,
    reported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_service_status CHECK (status IN ('Running', 'Stopped', 'Paused', 'StartPending', 'StopPending', 'ContinuePending', 'PausePending'))
);

CREATE INDEX IF NOT EXISTS idx_windows_services_agent ON agent_windows_services(agent_id);
CREATE INDEX IF NOT EXISTS idx_windows_services_reported ON agent_windows_services(reported_at DESC);

-- Drive Information Table
CREATE TABLE IF NOT EXISTS agent_drive_info (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    drive_letter VARCHAR(10) NOT NULL,
    drive_label VARCHAR(255),
    total_gb BIGINT NOT NULL,
    used_gb BIGINT NOT NULL,
    free_gb BIGINT NOT NULL,
    percent_used INTEGER NOT NULL,
    reported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_percent_used CHECK (percent_used >= 0 AND percent_used <= 100)
);

CREATE INDEX IF NOT EXISTS idx_drive_info_agent ON agent_drive_info(agent_id);
CREATE INDEX IF NOT EXISTS idx_drive_info_reported ON agent_drive_info(reported_at DESC);

-- Website/API Ping Table
CREATE TABLE IF NOT EXISTS agent_website_pings (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    response_time_ms INTEGER NOT NULL,
    checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_ping_status CHECK (status IN ('healthy', 'unhealthy', 'timeout'))
);

CREATE INDEX IF NOT EXISTS idx_website_pings_agent ON agent_website_pings(agent_id);
CREATE INDEX IF NOT EXISTS idx_website_pings_checked ON agent_website_pings(checked_at DESC);
