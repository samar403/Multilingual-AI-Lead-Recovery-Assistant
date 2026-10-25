// SQLite schema. node:sqlite keeps the deployment dependency-free (no native
// builds); the same schema ports 1:1 to Postgres for multi-node deployments.

export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vertical TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  default_lang TEXT NOT NULL DEFAULT 'gu',
  plan TEXT NOT NULL DEFAULT 'growth',
  webhook_key TEXT NOT NULL UNIQUE,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  ui_lang TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'gu',
  script TEXT NOT NULL DEFAULT 'native',
  source TEXT NOT NULL DEFAULT 'missed_call',
  status TEXT NOT NULL DEFAULT 'new',
  score INTEGER NOT NULL DEFAULT 0,
  temperature TEXT NOT NULL DEFAULT 'cold',
  intent TEXT NOT NULL DEFAULT '',
  slots TEXT NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '',
  value_estimate INTEGER NOT NULL DEFAULT 0,
  ai_paused INTEGER NOT NULL DEFAULT 0,
  consent TEXT NOT NULL DEFAULT 'implied_inbound',
  notes TEXT NOT NULL DEFAULT '',
  first_response_ms INTEGER,
  missed_at TEXT,
  last_inbound_at TEXT,
  last_outbound_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads(tenant_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  gloss TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  template TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  provider_id TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_lead ON messages(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_provider ON messages(provider_id);

CREATE TABLE IF NOT EXISTS followups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  channel TEXT NOT NULL,
  step INTEGER NOT NULL DEFAULT 1,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  executed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(status, due_at);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'confirmed',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(tenant_id, starts_at);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_s INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'sandbox',
  provider_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_tenant ON usage_events(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consents_phone ON consents(tenant_id, phone);

CREATE TABLE IF NOT EXISTS integrations (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  config TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`;
