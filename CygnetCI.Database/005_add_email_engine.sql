-- Migration: EmailEngine support (outbound email via RabbitMQ + C# worker).
-- Creates app_settings, email_templates, email_log, password_reset_tokens.
-- Idempotent — safe to run multiple times. Seeds do not overwrite edited rows.

-- 1) Global application settings (key/value). SMTP config lives here as XML.
CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2) DB-editable email templates (rendered with Scriban {{ }} placeholders).
CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    subject VARCHAR(500) NOT NULL,
    html_body TEXT NOT NULL,
    text_body TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3) Audit log of every send attempt (written by the EmailEngine).
CREATE TABLE IF NOT EXISTS email_log (
    id SERIAL PRIMARY KEY,
    recipient TEXT NOT NULL,
    email_type VARCHAR(50),
    template VARCHAR(100),
    subject VARCHAR(500),
    provider VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',   -- sent, failed
    error TEXT,
    message_id VARCHAR(255),
    idempotency_key VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sent_at TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_log_idem
    ON email_log(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log(created_at);

-- 4) Single-use password reset tokens (only the SHA-256 hash is stored).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens(user_id);

-- ---- Seed default settings (do not overwrite if present) ----
INSERT INTO app_settings (key, value, description) VALUES
  ('smtp',
   '<smtp type="smtp"><host>localhost</host><port>587</port><username></username><password></password><useStartTls>true</useStartTls><from name="CygnetCI" address="no-reply@cygnet.one"/></smtp>',
   'Outbound SMTP configuration (XML). type = smtp | sendgrid | gcp-oauth')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, description) VALUES
  ('web_base_url', 'http://localhost', 'Base URL of the web UI, used to build links (e.g. password reset)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, description) VALUES
  ('alert_recipients', '', 'Comma-separated recipient list for system alert emails')
ON CONFLICT (key) DO NOTHING;

-- ---- Seed default templates (do not overwrite edited templates) ----
INSERT INTO email_templates (name, subject, html_body, text_body) VALUES
(
  'password_reset',
  'Reset your CygnetCI password',
  '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937">
<h2 style="color:#4f46e5">Password reset</h2>
<p>Hi {{ full_name }},</p>
<p>We received a request to reset your CygnetCI password. This link expires in {{ ttl_minutes }} minutes.</p>
<p><a href="{{ reset_url }}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Reset password</a></p>
<p style="color:#6b7280;font-size:12px">If you did not request this, you can safely ignore this email.</p>
</div>',
  'Reset your CygnetCI password: {{ reset_url }} (expires in {{ ttl_minutes }} minutes).'
),
(
  'user_welcome',
  'Welcome to CygnetCI',
  '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937">
<h2 style="color:#4f46e5">Welcome, {{ full_name }}</h2>
<p>An account has been created for you on CygnetCI.</p>
<p><b>Username:</b> {{ username }}</p>
<p><a href="{{ login_url }}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Sign in</a></p>
</div>',
  'Welcome to CygnetCI. Username: {{ username }}. Sign in: {{ login_url }}'
),
(
  'agent_alert',
  '[CygnetCI] {{ alert_subject }}',
  '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
<h2 style="color:#dc2626">{{ alert_subject }}</h2>
<p>{{ message }}</p>
<table style="font-size:13px;color:#374151">
<tr><td style="padding:2px 8px"><b>Event</b></td><td>{{ event }}</td></tr>
<tr><td style="padding:2px 8px"><b>Resource</b></td><td>{{ resource }}</td></tr>
<tr><td style="padding:2px 8px"><b>Time</b></td><td>{{ occurred_at }}</td></tr>
</table>
</div>',
  '{{ alert_subject }} - {{ message }} ({{ event }} / {{ resource }} at {{ occurred_at }})'
),
(
  'generic',
  '{{ subject }}',
  '{{ body_html }}',
  '{{ body_text }}'
)
ON CONFLICT (name) DO NOTHING;

SELECT 'email engine tables ready' AS status;
