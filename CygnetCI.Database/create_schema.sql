-- create_schema.sql
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  username varchar(150) UNIQUE NOT NULL,
  full_name varchar(200),
  email varchar(200) UNIQUE,
  hashed_password varchar(255) NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id serial PRIMARY KEY,
  name varchar(150) UNIQUE NOT NULL,
  description text
);

CREATE TABLE IF NOT EXISTS rights (
  id serial PRIMARY KEY,
  role_id integer REFERENCES roles(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  description text
);

CREATE TABLE IF NOT EXISTS user_roles (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  role_id integer REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agents (
  id serial PRIMARY KEY,
  name varchar(200) NOT NULL,
  ip_address varchar(100),
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipelines (
  id serial PRIMARY KEY,
  name varchar(200) NOT NULL,
  environment varchar(100),
  description text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_connections (
  id serial PRIMARY KEY,
  agent_id integer REFERENCES agents(id) ON DELETE CASCADE,
  endpoint varchar(500),
  unique_number varchar(200),
  last_check timestamp,
  status varchar(50)
);

CREATE TABLE IF NOT EXISTS monitoring_logs (
  id serial PRIMARY KEY,
  agent_id integer REFERENCES agents(id) ON DELETE SET NULL,
  service varchar(200),
  message text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifacts (
  id serial PRIMARY KEY,
  pipeline_id integer REFERENCES pipelines(id) ON DELETE CASCADE,
  name varchar(300),
  version varchar(100),
  branch varchar(200),
  path varchar(1000),
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scripts (
  id serial PRIMARY KEY,
  client varchar(200),
  branch varchar(200),
  name varchar(300),
  path varchar(1000),
  created_at timestamp DEFAULT now()
);
