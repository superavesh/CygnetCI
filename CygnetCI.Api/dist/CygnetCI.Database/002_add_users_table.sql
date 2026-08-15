-- Migration: Add users table for authentication and authorization
-- Date: 2025-12-31
-- Description: Creates users and user_customers tables for multi-tenant user management

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    hashed_password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_superuser BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_login TIMESTAMP
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create user_customers junction table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS user_customers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    role VARCHAR(50),  -- Optional: 'admin', 'user', 'viewer', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(user_id, customer_id)
);

-- Create indexes for user_customers table
CREATE INDEX IF NOT EXISTS idx_user_customers_user_id ON user_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_customers_customer_id ON user_customers(customer_id);

-- Create a default admin user (password: 'admin123' hashed with SHA-256)
-- Note: In production, use proper password hashing like bcrypt
INSERT INTO users (username, email, full_name, hashed_password, is_active, is_superuser)
VALUES (
    'admin',
    'admin@cygnetci.com',
    'System Administrator',
    '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',  -- SHA-256 hash of 'admin123'
    TRUE,
    TRUE
) ON CONFLICT (username) DO NOTHING;

-- Link admin user to default customer (if exists)
DO $$
DECLARE
    admin_user_id INTEGER;
    default_customer_id INTEGER;
BEGIN
    -- Get admin user ID
    SELECT id INTO admin_user_id FROM users WHERE username = 'admin';

    -- Get default customer ID
    SELECT id INTO default_customer_id FROM customers WHERE name = 'default' LIMIT 1;

    -- Link admin to default customer if both exist
    IF admin_user_id IS NOT NULL AND default_customer_id IS NOT NULL THEN
        INSERT INTO user_customers (user_id, customer_id, role)
        VALUES (admin_user_id, default_customer_id, 'admin')
        ON CONFLICT (user_id, customer_id) DO NOTHING;
    END IF;
END $$;

-- Verification queries
SELECT 'Users table created successfully' AS status;
SELECT * FROM users;
SELECT * FROM user_customers;
