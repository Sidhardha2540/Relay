-- Coord daemon SQLite schema.
-- Apply with: sqlite3 .shared/state.db < schema.sql
-- The daemon applies this automatically on startup if tables are missing.

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------
-- Decisions: First-Write-Wins. Conflict raises 409.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decisions (
    scope       TEXT    NOT NULL,
    key         TEXT    NOT NULL,
    value       TEXT    NOT NULL,
    agent       TEXT    NOT NULL,
    rationale   TEXT,
    created_at  TEXT    NOT NULL,         -- ISO-8601 UTC
    sequence    INTEGER NOT NULL,         -- monotonic, server-assigned
    PRIMARY KEY (scope, key)
);
CREATE INDEX IF NOT EXISTS idx_decisions_seq ON decisions(sequence);

-- ----------------------------------------------------------------------
-- Discoveries: Last-Write-Wins. Old entries marked superseded, not deleted.
-- file_hash enables stale detection on read.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discoveries (
    id          TEXT    PRIMARY KEY,      -- "disc_<hex8>"
    scope       TEXT    NOT NULL,
    summary     TEXT    NOT NULL,
    file_hash   TEXT,                     -- sha256 of file content at observation time
    agent       TEXT    NOT NULL,
    confidence  TEXT    DEFAULT 'unverified',  -- unverified | verified | contradicted
    created_at  TEXT    NOT NULL,
    superseded  INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_discoveries_scope_active
    ON discoveries(scope) WHERE superseded = 0;

-- ----------------------------------------------------------------------
-- Intents: TTL leases on a scope. Auto-GC on every read_state.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intents (
    id          TEXT    PRIMARY KEY,      -- "int_<hex8>"
    scope       TEXT    NOT NULL,
    action      TEXT    NOT NULL,
    agent       TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    expires_at  TEXT    NOT NULL,         -- ISO-8601 UTC
    status      TEXT    DEFAULT 'active'  -- active | expired | released | completed
);
CREATE INDEX IF NOT EXISTS idx_intents_scope_active
    ON intents(scope, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_intents_agent_active
    ON intents(agent, status) WHERE status = 'active';

-- ----------------------------------------------------------------------
-- Questions: append-only with status transitions. Never deleted.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
    id            TEXT    PRIMARY KEY,    -- "q_<hex8>"
    scope         TEXT    NOT NULL,
    asks          TEXT    NOT NULL,
    asker_agent   TEXT    NOT NULL,
    target        TEXT    NOT NULL,       -- "human" | "<agent_id>"
    blocking      INTEGER DEFAULT 1,
    status        TEXT    DEFAULT 'open', -- open | answered | resolved | deferred
    answer        TEXT,
    resolved_by   TEXT,
    created_at    TEXT    NOT NULL,
    resolved_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_questions_open
    ON questions(status, blocking) WHERE status IN ('open', 'answered');

-- ----------------------------------------------------------------------
-- Monotonic sequence counter for FWW tiebreaking.
-- Single row, updated under db_lock.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sequence_counter (
    id    INTEGER PRIMARY KEY CHECK (id = 1),
    value INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO sequence_counter (id, value) VALUES (1, 0);
