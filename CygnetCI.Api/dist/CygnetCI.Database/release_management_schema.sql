-- Release Management Schema for CygnetCI
-- This adds Azure DevOps-like release and deployment capabilities

-- Environments (Dev, QA, Staging, Production)
CREATE TABLE IF NOT EXISTS environments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    order_index INTEGER DEFAULT 0,
    requires_approval BOOLEAN DEFAULT FALSE,
    approvers TEXT[], -- Array of user emails/names
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Releases (deployment definitions)
CREATE TABLE IF NOT EXISTS releases (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    pipeline_id INTEGER REFERENCES pipelines(id) ON DELETE SET NULL,
    version VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active', -- active, disabled, archived
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_release_status CHECK (status IN ('active', 'disabled', 'archived'))
);

-- Release Stages (deployment stages per environment)
CREATE TABLE IF NOT EXISTS release_stages (
    id SERIAL PRIMARY KEY,
    release_id INTEGER REFERENCES releases(id) ON DELETE CASCADE,
    environment_id INTEGER REFERENCES environments(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    pipeline_id INTEGER REFERENCES pipelines(id) ON DELETE SET NULL,
    pre_deployment_approval BOOLEAN DEFAULT FALSE,
    post_deployment_approval BOOLEAN DEFAULT FALSE,
    auto_deploy BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(release_id, environment_id)
);

-- Release Executions (deployment history)
CREATE TABLE IF NOT EXISTS release_executions (
    id SERIAL PRIMARY KEY,
    release_id INTEGER REFERENCES releases(id) ON DELETE CASCADE,
    release_number VARCHAR(50) NOT NULL, -- e.g., "Release-1", "Release-2"
    triggered_by VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    artifact_version VARCHAR(100),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_release_execution_status CHECK (status IN ('pending', 'in_progress', 'succeeded', 'failed', 'cancelled', 'partially_succeeded'))
);

-- Stage Executions (per environment deployment tracking)
CREATE TABLE IF NOT EXISTS stage_executions (
    id SERIAL PRIMARY KEY,
    release_execution_id INTEGER REFERENCES release_executions(id) ON DELETE CASCADE,
    release_stage_id INTEGER REFERENCES release_stages(id) ON DELETE CASCADE,
    environment_id INTEGER REFERENCES environments(id) ON DELETE CASCADE,
    environment_name VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    pipeline_execution_id INTEGER REFERENCES pipeline_executions(id) ON DELETE SET NULL,
    approval_status VARCHAR(50) DEFAULT 'not_required',
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    approval_comments TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_stage_execution_status CHECK (status IN ('pending', 'awaiting_approval', 'in_progress', 'succeeded', 'failed', 'cancelled', 'skipped')),
    CONSTRAINT check_approval_status CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected'))
);

-- Artifacts (build outputs)
CREATE TABLE IF NOT EXISTS artifacts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(100) NOT NULL,
    artifact_type VARCHAR(50) DEFAULT 'build', -- build, container, package, file
    pipeline_execution_id INTEGER REFERENCES pipeline_executions(id) ON DELETE CASCADE,
    release_execution_id INTEGER REFERENCES release_executions(id) ON DELETE CASCADE,
    storage_path TEXT,
    download_url TEXT,
    size_bytes BIGINT,
    checksum VARCHAR(255),
    artifact_metadata JSONB, -- Additional metadata as JSON (renamed from metadata to avoid SQLAlchemy conflict)
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_artifact_type CHECK (artifact_type IN ('build', 'container', 'package', 'file', 'other'))
);

-- Variable Groups (shared configuration)
CREATE TABLE IF NOT EXISTS variable_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Variables (environment-specific and shared variables)
CREATE TABLE IF NOT EXISTS variables (
    id SERIAL PRIMARY KEY,
    variable_group_id INTEGER REFERENCES variable_groups(id) ON DELETE CASCADE,
    environment_id INTEGER REFERENCES environments(id) ON DELETE CASCADE, -- NULL for shared variables
    key VARCHAR(255) NOT NULL,
    value TEXT,
    is_secret BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Release Parameters (runtime parameters for release execution)
CREATE TABLE IF NOT EXISTS release_execution_parameters (
    id SERIAL PRIMARY KEY,
    release_execution_id INTEGER REFERENCES release_executions(id) ON DELETE CASCADE,
    parameter_name VARCHAR(255) NOT NULL,
    parameter_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_releases_pipeline_id ON releases(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_releases_status ON releases(status);
CREATE INDEX IF NOT EXISTS idx_release_stages_release_id ON release_stages(release_id);
CREATE INDEX IF NOT EXISTS idx_release_stages_environment_id ON release_stages(environment_id);
CREATE INDEX IF NOT EXISTS idx_release_executions_release_id ON release_executions(release_id);
CREATE INDEX IF NOT EXISTS idx_release_executions_status ON release_executions(status);
CREATE INDEX IF NOT EXISTS idx_stage_executions_release_execution_id ON stage_executions(release_execution_id);
CREATE INDEX IF NOT EXISTS idx_stage_executions_environment_id ON stage_executions(environment_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_pipeline_execution_id ON artifacts(pipeline_execution_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_release_execution_id ON artifacts(release_execution_id);
CREATE INDEX IF NOT EXISTS idx_variables_variable_group_id ON variables(variable_group_id);
CREATE INDEX IF NOT EXISTS idx_variables_environment_id ON variables(environment_id);

-- Insert default environments
INSERT INTO environments (name, description, order_index, requires_approval) VALUES
    ('Development', 'Development environment for testing', 1, false),
    ('QA', 'Quality Assurance environment', 2, false),
    ('Staging', 'Staging environment for pre-production testing', 3, true),
    ('Production', 'Production environment', 4, true)
ON CONFLICT (name) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE environments IS 'Deployment environments (Dev, QA, Staging, Production)';
COMMENT ON TABLE releases IS 'Release definitions that orchestrate deployments across environments';
COMMENT ON TABLE release_stages IS 'Individual deployment stages for each environment in a release';
COMMENT ON TABLE release_executions IS 'History of release deployments with overall status';
COMMENT ON TABLE stage_executions IS 'Execution details for each environment stage in a release';
COMMENT ON TABLE artifacts IS 'Build artifacts and packages created during pipeline execution';
COMMENT ON TABLE variable_groups IS 'Groups of configuration variables that can be shared';
COMMENT ON TABLE variables IS 'Configuration variables for environments and releases';
