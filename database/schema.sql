-- O servidor cria estas tabelas automaticamente. Este arquivo existe para auditoria e manutenção manual.

CREATE TABLE IF NOT EXISTS mirna_app_state (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  client_updated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mirna_files (
  id TEXT PRIMARY KEY,
  destination_id TEXT NOT NULL,
  name TEXT NOT NULL,
  blob_pathname TEXT NOT NULL,
  blob_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mirna_files_destination_idx ON mirna_files(destination_id);
CREATE INDEX IF NOT EXISTS mirna_files_created_idx ON mirna_files(created_at DESC);
