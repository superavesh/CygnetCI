-- Migration: Add user_roles junction table and reconcile user_customers
-- Description: A user can have MULTIPLE roles (many-to-many) and be mapped to
--              one or more customers (many-to-many via user_customers).
-- Safe to run multiple times (idempotent).

-- 1) user_roles junction table (many-to-many between users and roles)
CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- 2) Reconcile user_customers with the ORM model (adds columns the model expects
--    without dropping the pre-existing 'role'/'created_at' columns).
ALTER TABLE user_customers ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE user_customers ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL;

-- Verification
SELECT 'user_roles table ready' AS status;
