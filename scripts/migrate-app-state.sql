-- Remove conversationId from app_state table.
-- Run once on existing deployments, then delete this script.
-- Usage: sqlite3 /path/to/clawchat.db < scripts/migrate-app-state.sql

CREATE TABLE app_state_new (
  appId TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  updatedAt TEXT NOT NULL
);
INSERT INTO app_state_new SELECT appId, state, version, updatedAt FROM app_state;
DROP TABLE app_state;
ALTER TABLE app_state_new RENAME TO app_state;
