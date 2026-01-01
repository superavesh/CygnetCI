-- File Transfer Management Schema for CygnetCI
-- This schema handles file uploads (scripts/artifacts) and agent file pickups

-- ===================================================
-- TRANSFER FILES TABLE
-- Stores uploaded files (scripts and artifacts)
-- ===================================================

CREATE TABLE IF NOT EXISTS transfer_files (
    id SERIAL PRIMARY KEY,
    file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('script', 'artifact')),
    file_name VARCHAR(255) NOT NULL,
    version VARCHAR(100) NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    checksum VARCHAR(255),
    uploaded_by VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure unique combination of file_type, file_name, and version
    UNIQUE(file_type, file_name, version)
);

CREATE INDEX idx_transfer_files_type ON transfer_files(file_type);
CREATE INDEX idx_transfer_files_version ON transfer_files(version);
CREATE INDEX idx_transfer_files_created ON transfer_files(created_at DESC);

COMMENT ON TABLE transfer_files IS 'Stores uploaded scripts and artifacts with version control';
COMMENT ON COLUMN transfer_files.file_type IS 'Type of file: script or artifact';
COMMENT ON COLUMN transfer_files.file_path IS 'Full path to file in NFSShared folder';
COMMENT ON COLUMN transfer_files.version IS 'Version number/name of the file';


-- ===================================================
-- TRANSFER FILE PICKUP TABLE
-- Tracks which files need to be downloaded by which agents
-- ===================================================

CREATE TABLE IF NOT EXISTS transfer_file_pickup (
    id SERIAL PRIMARY KEY,
    transfer_file_id INTEGER NOT NULL REFERENCES transfer_files(id) ON DELETE CASCADE,
    agent_uuid VARCHAR(255) NOT NULL,
    agent_name VARCHAR(255),
    file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('script', 'artifact')),
    version VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'downloaded', 'failed')),
    requested_by VARCHAR(255),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    downloaded_at TIMESTAMP,
    acknowledged_at TIMESTAMP,
    error_message TEXT
);

-- Create indexes separately
CREATE INDEX IF NOT EXISTS idx_pickup_agent_uuid ON transfer_file_pickup(agent_uuid);
CREATE INDEX IF NOT EXISTS idx_pickup_status ON transfer_file_pickup(status);
CREATE INDEX IF NOT EXISTS idx_pickup_requested ON transfer_file_pickup(requested_at DESC);

COMMENT ON TABLE transfer_file_pickup IS 'Queue of files to be downloaded by agents';
COMMENT ON COLUMN transfer_file_pickup.agent_uuid IS 'UUID of the agent that should download this file';
COMMENT ON COLUMN transfer_file_pickup.status IS 'Status: pending (waiting for download), downloaded (agent downloaded), failed (download error)';
COMMENT ON COLUMN transfer_file_pickup.acknowledged_at IS 'Timestamp when agent acknowledged successful download';


-- ===================================================
-- SAMPLE DATA (Optional)
-- ===================================================

-- You can insert sample data here if needed for testing
-- Example:
-- INSERT INTO transfer_files (file_type, file_name, version, file_path, uploaded_by)
-- VALUES ('script', 'deploy.sh', 'v1.0.0', '/NFSShared/scripts/v1.0.0/deploy.sh', 'admin');
