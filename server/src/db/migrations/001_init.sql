-- BrandShield.ai initial schema.
-- Append-only history tables (guideline versions, submission versions, review actions)
-- are only ever INSERTed. Library items are deactivated, never silently deleted.

CREATE TABLE IF NOT EXISTS roles (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role_key TEXT NOT NULL REFERENCES roles(key),
  team TEXT NOT NULL DEFAULT 'General',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deactivated_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brand_guidelines (
  id TEXT PRIMARY KEY,
  stable_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deactivated_at TEXT
);

CREATE TABLE IF NOT EXISTS brand_guideline_versions (
  id TEXT PRIMARY KEY,
  guideline_id TEXT NOT NULL REFERENCES brand_guidelines(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  change_note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (guideline_id, version)
);

CREATE TABLE IF NOT EXISTS approved_facts (
  id TEXT PRIMARY KEY,
  stable_id TEXT NOT NULL UNIQUE,
  statement TEXT NOT NULL,
  source TEXT NOT NULL,
  owner TEXT NOT NULL,
  effective_date TEXT,
  expiry_date TEXT,
  keywords TEXT NOT NULL DEFAULT '[]',
  successor_id TEXT REFERENCES approved_facts(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deactivated_at TEXT
);

CREATE TABLE IF NOT EXISTS terminology_entries (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  preferred_term TEXT NOT NULL,
  banned_terms TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  guideline_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deactivated_at TEXT
);

CREATE TABLE IF NOT EXISTS brand_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('logo', 'colour', 'image')),
  value TEXT NOT NULL DEFAULT '',
  file_path TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deactivated_at TEXT
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'banned_phrase', 'required_term', 'claim', 'length', 'alt_text',
    'reading_level', 'heading_order', 'link_text', 'contrast'
  )),
  config TEXT NOT NULL DEFAULT '{}',
  severity TEXT NOT NULL CHECK (severity IN ('blocker', 'warning', 'suggestion')),
  guideline_ref TEXT,
  channel TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('LinkedIn', 'website', 'email', 'print')),
  type TEXT NOT NULL CHECK (type IN ('text', 'document', 'image')),
  content TEXT NOT NULL DEFAULT '',
  alt_text TEXT,
  file_path TEXT,
  file_name TEXT,
  ai_disclosure TEXT NOT NULL CHECK (ai_disclosure IN ('none', 'AI-assisted', 'AI-generated')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'analysed', 'awaiting_review', 'changes_requested',
    'approved', 'rejected', 'ready_to_publish'
  )),
  owner_id TEXT NOT NULL REFERENCES users(id),
  team TEXT NOT NULL DEFAULT 'General',
  current_version INTEGER NOT NULL DEFAULT 1,
  last_llm_provider TEXT,
  last_llm_version TEXT,
  last_llm_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS submission_versions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  alt_text TEXT,
  file_name TEXT,
  created_by TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (submission_id, version)
);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  submission_version_id TEXT NOT NULL REFERENCES submission_versions(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('blocker', 'warning', 'suggestion')),
  span_start INTEGER NOT NULL DEFAULT 0,
  span_end INTEGER NOT NULL DEFAULT 0,
  quote TEXT NOT NULL DEFAULT '',
  guideline_ref TEXT,
  rule_ref TEXT,
  fact_ref TEXT,
  explanation TEXT NOT NULL,
  suggestion TEXT,
  evidence TEXT,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'accepted', 'edited', 'rejected')),
  decision_by TEXT,
  decision_at TEXT,
  edited_text TEXT,
  source TEXT NOT NULL DEFAULT 'rule' CHECK (source IN ('rule', 'llm', 'accessibility')),
  provider_version TEXT,
  created_at TEXT NOT NULL,
  -- An issue without any reference may only ever be a suggestion, never an error.
  CHECK (
    severity = 'suggestion'
    OR guideline_ref IS NOT NULL
    OR rule_ref IS NOT NULL
    OR fact_ref IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS review_actions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  submission_version_id TEXT REFERENCES submission_versions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  comment TEXT,
  before_content TEXT,
  after_content TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS confidential_patterns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pattern TEXT NOT NULL,
  replacement TEXT NOT NULL DEFAULT '[REDACTED]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_issues_submission ON issues(submission_id);
CREATE INDEX IF NOT EXISTS idx_issues_guideline ON issues(guideline_ref);
CREATE INDEX IF NOT EXISTS idx_issues_decision ON issues(decision);
CREATE INDEX IF NOT EXISTS idx_actions_submission ON review_actions(submission_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_owner ON submissions(owner_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_versions_submission ON submission_versions(submission_id);
