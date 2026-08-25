BEGIN;

CREATE TABLE IF NOT EXISTS conversation_turns (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation_states(conversation_id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content_redacted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  conversation_id TEXT REFERENCES conversation_states(conversation_id) ON DELETE SET NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('user_preference','episodic','decision','correction','unresolved')),
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  typed_value JSONB NOT NULL,
  normalized_text TEXT,
  confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  salience NUMERIC NOT NULL DEFAULT 0 CHECK (salience >= 0 AND salience <= 1),
  source_turn_id TEXT REFERENCES conversation_turns(id) ON DELETE SET NULL,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  supersedes_id TEXT REFERENCES memory_items(id) ON DELETE SET NULL,
  user_confirmed BOOLEAN NOT NULL DEFAULT false,
  privacy_class TEXT NOT NULL CHECK (privacy_class IN ('standard','sensitive')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('CANDIDATE','ACTIVE','SUPERSEDED','REJECTED','EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memory_items_actor_key_idx ON memory_items(actor_id, namespace, key);
CREATE INDEX IF NOT EXISTS memory_items_retrieval_idx ON memory_items(actor_id, memory_type, status, valid_until);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id TEXT PRIMARY KEY REFERENCES conversation_states(conversation_id) ON DELETE CASCADE,
  covered_until_sequence INTEGER NOT NULL DEFAULT 0,
  active_goals JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  unresolved_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_corrections JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
