-- Migration: Add parent_agent_id to agents table for sub-agent support
-- Run this script against your PostgreSQL database

ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS parent_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL;

-- Index for faster sub-agent lookups
CREATE INDEX IF NOT EXISTS idx_agents_parent_agent_id ON agents(parent_agent_id);

COMMENT ON COLUMN agents.parent_agent_id IS 'ID of the parent (jump server) agent. NULL means this is a top-level agent.';
