-- Migration: Add DAG tracking columns to pipeline_executions
-- Run this once against your PostgreSQL database before deploying the updated FastAPI code.
--
-- What this does:
--   1. Adds release_execution_id  → links a PipelineExecution back to its ReleaseExecution
--   2. Adds release_pipeline_id   → links a PipelineExecution to its node in the release graph
--   3. Adds 'pending' to the status check constraint so waiting nodes can be stored

BEGIN;

-- 1. New columns
ALTER TABLE pipeline_executions
    ADD COLUMN IF NOT EXISTS release_execution_id INTEGER
        REFERENCES release_executions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS release_pipeline_id  INTEGER
        REFERENCES release_pipelines(id)  ON DELETE SET NULL;

-- 2. Indexes for the completion-callback DAG query
CREATE INDEX IF NOT EXISTS idx_pe_release_execution_id
    ON pipeline_executions (release_execution_id);

CREATE INDEX IF NOT EXISTS idx_pe_release_pipeline_id
    ON pipeline_executions (release_pipeline_id);

-- 3. Allow 'pending' status (waiting for upstream dependency)
ALTER TABLE pipeline_executions
    DROP CONSTRAINT IF EXISTS check_execution_status;

ALTER TABLE pipeline_executions
    ADD CONSTRAINT check_execution_status
    CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled'));

-- 4. Allow started_at to be NULL (pending nodes haven't started yet)
ALTER TABLE pipeline_executions
    ALTER COLUMN started_at DROP NOT NULL;

COMMIT;
