-- Migration: add release tracking columns to pipeline_executions
-- Safe to run multiple times (uses IF NOT EXISTS checks)

DO $$
BEGIN
    -- release_execution_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='pipeline_executions' AND column_name='release_execution_id'
    ) THEN
        ALTER TABLE pipeline_executions
            ADD COLUMN release_execution_id INTEGER
            REFERENCES release_executions(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_pe_release_execution_id ON pipeline_executions(release_execution_id);
        RAISE NOTICE 'release_execution_id added.';
    ELSE
        RAISE NOTICE 'release_execution_id already exists, skipping.';
    END IF;

    -- release_pipeline_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='pipeline_executions' AND column_name='release_pipeline_id'
    ) THEN
        ALTER TABLE pipeline_executions
            ADD COLUMN release_pipeline_id INTEGER
            REFERENCES release_pipelines(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_pe_release_pipeline_id ON pipeline_executions(release_pipeline_id);
        RAISE NOTICE 'release_pipeline_id added.';
    ELSE
        RAISE NOTICE 'release_pipeline_id already exists, skipping.';
    END IF;
END $$;