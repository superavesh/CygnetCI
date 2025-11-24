-- seed_data.sql
INSERT INTO roles (name, description) VALUES (''admin'',''Administrator role'') ON CONFLICT DO NOTHING;
INSERT INTO roles (name, description) VALUES (''developer'',''Developer role'') ON CONFLICT DO NOTHING;
