-- BrandShield.ai account types, workspaces, invitations and mock email.
-- Additive only: no existing table or column is dropped.

ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'creator'
  CHECK (account_type IN ('creator', 'reviewer', 'agency', 'leadership', 'admin'));
ALTER TABLE users ADD COLUMN account_state TEXT NOT NULL DEFAULT 'active'
  CHECK (account_state IN ('active', 'pending', 'suspended'));
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN team_name TEXT;
ALTER TABLE users ADD COLUMN agency_name TEXT;
ALTER TABLE users ADD COLUMN email_verification_token_hash TEXT;
ALTER TABLE users ADD COLUMN email_verification_expires_at TEXT;
ALTER TABLE users ADD COLUMN password_reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN password_reset_expires_at TEXT;

UPDATE users
SET account_type = CASE role_key
  WHEN 'admin' THEN 'admin'
  WHEN 'reviewer' THEN 'reviewer'
  WHEN 'leadership' THEN 'leadership'
  ELSE 'creator'
END;

UPDATE users SET team_name = team WHERE team_name IS NULL;
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

INSERT OR IGNORE INTO roles (key, name, description)
VALUES ('agency', 'Agency or partner', 'Creates content for assigned brand workspaces only');

CREATE TABLE IF NOT EXISTS brand_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO brand_workspaces (id, name, created_at)
SELECT 'ws-default', 'Default workspace', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM brand_workspaces);

CREATE TABLE IF NOT EXISTS brand_workspace_members (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_workspace_id TEXT NOT NULL REFERENCES brand_workspaces(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, brand_workspace_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  brand_workspace_id TEXT NOT NULL REFERENCES brand_workspaces(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_by_user_id TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'verification',
  created_at TEXT NOT NULL
);

ALTER TABLE submissions ADD COLUMN brand_workspace_id TEXT REFERENCES brand_workspaces(id);

UPDATE submissions
SET brand_workspace_id = 'ws-default'
WHERE brand_workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_members_workspace ON brand_workspace_members(brand_workspace_id);
CREATE INDEX IF NOT EXISTS idx_invitations_workspace ON invitations(brand_workspace_id);
CREATE INDEX IF NOT EXISTS idx_invitations_hash ON invitations(code_hash);
CREATE INDEX IF NOT EXISTS idx_email_outbox_created ON email_outbox(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_workspace ON submissions(brand_workspace_id);
