-- Migration: Add Customer/Tenant Support to CygnetCI
-- Description: This migration adds multi-tenant customer support to the CygnetCI platform
-- Date: 2025-12-31

BEGIN;

-- ===================================================
-- 1. CREATE CUSTOMERS TABLE
-- ===================================================

CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    logo_url VARCHAR(500),
    settings JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_is_active ON customers(is_active);

COMMENT ON TABLE customers IS 'Customer/tenant master table for multi-tenant support';
COMMENT ON COLUMN customers.name IS 'Unique customer identifier (slug/code)';
COMMENT ON COLUMN customers.display_name IS 'Display name for UI';
COMMENT ON COLUMN customers.settings IS 'Customer-specific configuration settings';

-- ===================================================
-- 2. CREATE USER-CUSTOMER MAPPING TABLE
-- ===================================================

CREATE TABLE IF NOT EXISTS user_customers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    is_default BOOLEAN DEFAULT FALSE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by INTEGER REFERENCES users(id),
    UNIQUE(user_id, customer_id)
);

CREATE INDEX idx_user_customers_user_id ON user_customers(user_id);
CREATE INDEX idx_user_customers_customer_id ON user_customers(customer_id);
CREATE INDEX idx_user_customers_is_default ON user_customers(user_id, is_default);

COMMENT ON TABLE user_customers IS 'Many-to-many mapping between users and customers for multi-tenant access';
COMMENT ON COLUMN user_customers.is_default IS 'Default customer for this user when logging in';

-- ===================================================
-- 3. ADD CUSTOMER_ID TO EXISTING TABLES
-- ===================================================

-- Add customer_id to agents table
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_agents_customer_id ON agents(customer_id);

-- Add customer_id to pipelines table
ALTER TABLE pipelines
ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pipelines_customer_id ON pipelines(customer_id);

-- Add customer_id to releases table
ALTER TABLE releases
ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_releases_customer_id ON releases(customer_id);

-- Add customer_id to services table
ALTER TABLE services
ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_services_customer_id ON services(customer_id);

-- ===================================================
-- 4. CREATE DEFAULT CUSTOMER FOR EXISTING DATA
-- ===================================================

-- Insert default customer if it doesn't exist
INSERT INTO customers (name, display_name, description, is_active)
VALUES ('default', 'Default Customer', 'Default customer for existing data migration', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Get the default customer ID
DO $$
DECLARE
    default_customer_id INTEGER;
BEGIN
    SELECT id INTO default_customer_id FROM customers WHERE name = 'default' LIMIT 1;

    -- Update existing agents to belong to default customer
    UPDATE agents SET customer_id = default_customer_id WHERE customer_id IS NULL;

    -- Update existing pipelines to belong to default customer
    UPDATE pipelines SET customer_id = default_customer_id WHERE customer_id IS NULL;

    -- Update existing releases to belong to default customer
    UPDATE releases SET customer_id = default_customer_id WHERE customer_id IS NULL;

    -- Update existing services to belong to default customer
    UPDATE services SET customer_id = default_customer_id WHERE customer_id IS NULL;
END $$;

-- ===================================================
-- 5. MAKE CUSTOMER_ID NOT NULL AFTER DATA MIGRATION
-- ===================================================

-- Now that all existing records have customer_id, make it NOT NULL
ALTER TABLE agents ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE pipelines ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE releases ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE services ALTER COLUMN customer_id SET NOT NULL;

-- ===================================================
-- 6. CREATE TRIGGER FOR UPDATED_AT
-- ===================================================

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for customers table
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ===================================================
-- 7. CREATE VIEWS FOR CUSTOMER STATISTICS
-- ===================================================

CREATE OR REPLACE VIEW customer_statistics AS
SELECT
    c.id as customer_id,
    c.name as customer_name,
    c.display_name,
    c.is_active,
    COUNT(DISTINCT a.id) as total_agents,
    COUNT(DISTINCT CASE WHEN a.status = 'online' THEN a.id END) as online_agents,
    COUNT(DISTINCT p.id) as total_pipelines,
    COUNT(DISTINCT CASE WHEN p.status = 'success' THEN p.id END) as successful_pipelines,
    COUNT(DISTINCT r.id) as total_releases,
    COUNT(DISTINCT s.id) as total_services,
    COUNT(DISTINCT uc.user_id) as total_users
FROM customers c
LEFT JOIN agents a ON c.id = a.customer_id
LEFT JOIN pipelines p ON c.id = p.customer_id
LEFT JOIN releases r ON c.id = r.customer_id
LEFT JOIN services s ON c.id = s.customer_id
LEFT JOIN user_customers uc ON c.id = uc.customer_id
GROUP BY c.id, c.name, c.display_name, c.is_active;

COMMENT ON VIEW customer_statistics IS 'Aggregated statistics per customer for dashboard';

-- ===================================================
-- 8. GRANT PERMISSIONS (adjust as needed for your setup)
-- ===================================================

-- Grant permissions to your application user (replace 'cygnetci_user' with your actual user)
-- GRANT ALL PRIVILEGES ON TABLE customers TO cygnetci_user;
-- GRANT ALL PRIVILEGES ON TABLE user_customers TO cygnetci_user;
-- GRANT USAGE, SELECT ON SEQUENCE customers_id_seq TO cygnetci_user;
-- GRANT USAGE, SELECT ON SEQUENCE user_customers_id_seq TO cygnetci_user;

COMMIT;

-- ===================================================
-- ROLLBACK SCRIPT (for reference, run separately if needed)
-- ===================================================

-- BEGIN;
-- DROP VIEW IF EXISTS customer_statistics;
-- DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
-- DROP FUNCTION IF EXISTS update_updated_at_column();
-- ALTER TABLE services DROP COLUMN IF EXISTS customer_id;
-- ALTER TABLE releases DROP COLUMN IF EXISTS customer_id;
-- ALTER TABLE pipelines DROP COLUMN IF EXISTS customer_id;
-- ALTER TABLE agents DROP COLUMN IF EXISTS customer_id;
-- DROP TABLE IF EXISTS user_customers;
-- DROP TABLE IF EXISTS customers;
-- COMMIT;
