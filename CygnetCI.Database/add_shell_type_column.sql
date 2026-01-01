-- Migration: Add shell_type column to pipeline_steps table
-- Date: 2025-11-28
-- Description: Add shell_type column to support PowerShell, Shell, and Batch execution modes

-- Add shell_type column with default value 'cmd' for existing rows
ALTER TABLE pipeline_steps
ADD COLUMN shell_type VARCHAR(20) DEFAULT 'cmd';

-- Add check constraint to ensure only valid shell types are used
ALTER TABLE pipeline_steps
ADD CONSTRAINT check_shell_type CHECK (shell_type IN ('powershell', 'cmd', 'bash'));

-- Update comment on column
COMMENT ON COLUMN pipeline_steps.shell_type IS 'Shell executor type: powershell, cmd, or bash';

-- For Windows systems, default to 'cmd', for Unix systems default to 'bash'
-- Users can override this per step during pipeline creation
