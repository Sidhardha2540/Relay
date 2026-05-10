"""SQLite + JSONL storage layer.

Single writer (the daemon process). All mutations go through `db_lock`.
JSONL appends are durable: write -> flush -> fsync.
"""
from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import aiofiles
import aiosqlite

from . import config

# Serialize all writes within the daemon process. SQLite WAL mode handles
# the database file; this lock guarantees the in-process sequence counter
# and our compound operations (e.g., "check then insert") are atomic.
db_lock = asyncio.Lock()
file_lock = asyncio.Lock()

_db: aiosqlite.Connection | None = None


# ----------------------------------------------------------------------
# Bootstrap
# ----------------------------------------------------------------------

async def init_storage() -> None:
    """Open the database, apply schema, ensure shared directory exists."""
    global _db
    config.ensure_shared_dir()

    _db = await aiosqlite.connect(config.DB_PATH)
    _db.row_factory = aiosqlite.Row
    await _db.execute("PRAGMA journal_mode = WAL")
    await _db.execute("PRAGMA synchronous = NORMAL")
    await _db.execute("PRAGMA foreign_keys = ON")

    schema = config.SCHEMA_PATH.read_text(encoding="utf-8")
    await _db.executescript(schema)
    await _db.commit()

    # Apply column migrations that cannot use IF NOT EXISTS in raw SQL.
    await _apply_migrations()

    # Ensure log file exists so tail -f works immediately.
    config.LOG_PATH.touch(exist_ok=True)
    config.INBOX_PATH.touch(exist_ok=True)


async def _apply_migrations() -> None:
    """Idempotently add new columns to existing tables.

    SQLite does not support ALTER TABLE … ADD COLUMN IF NOT EXISTS, so we
    probe PRAGMA table_info() first and skip any column already present.
    Safe to run on every startup — no-op after the first run.
    """
    # (table, column_name, column_definition)
    migrations = [
        ("decisions",   "anchor",   "TEXT"),
        ("decisions",   "mode",     "TEXT DEFAULT 'exclusive'"),
        ("intents",     "mode",     "TEXT DEFAULT 'exclusive'"),
        ("discoveries", "sequence", "INTEGER DEFAULT 0"),
        ("intents",     "sequence", "INTEGER DEFAULT 0"),
        ("questions",   "sequence", "INTEGER DEFAULT 0"),
    ]
    conn = db()
    for table, col, defn in migrations:
        cur = await conn.execute(f"PRAGMA table_info({table})")
        existing_cols = {row["name"] for row in await cur.fetchall()}
        await cur.close()
        if col not in existing_cols:
            await conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {defn}")
    await conn.commit()


async def close_storage() -> None:
    global _db
    if _db is not None:
        await _db.close()
        _db = None


def db() -> aiosqlite.Connection:
    if _db is None:
        raise RuntimeError("storage not initialized — call init_storage() at startup")
    return _db


# ----------------------------------------------------------------------
# Sequence counter — monotonic, used as decision tiebreaker
# ----------------------------------------------------------------------

async def next_sequence() -> int:
    """Increment and return the global sequence counter.

    Caller must hold db_lock.
    """
    cursor = await db().execute(
        "UPDATE sequence_counter SET value = value + 1 WHERE id = 1 "
        "RETURNING value"
    )
    row = await cursor.fetchone()
    await cursor.close()
    return row["value"]


# ----------------------------------------------------------------------
# Audit log — append-only JSONL with fsync
# ----------------------------------------------------------------------

async def append_log(entry: dict[str, Any]) -> None:
    """Append a single JSON line to the audit log, fsync'd to disk.

    Entries < 4KB are atomic on POSIX (PIPE_BUF guarantee).
    For larger entries we'd need a different scheme, but our entries are tiny.
    """
    line = json.dumps(entry, separators=(",", ":")) + "\n"
    async with file_lock:
        # aiofiles uses a thread pool under the hood; that's fine for our load.
        async with aiofiles.open(config.LOG_PATH, mode="a", encoding="utf-8") as f:
            await f.write(line)
            await f.flush()
            # fsync the underlying file descriptor for crash durability.
            await asyncio.to_thread(os.fsync, f.fileno())


# ----------------------------------------------------------------------
# Inbox materialization — human-readable mirror of open questions
# ----------------------------------------------------------------------

async def regenerate_inbox(questions: list[dict[str, Any]]) -> None:
    """Rewrite .shared/inbox.md from the current open question set.

    Sorted: blocking first, then by created_at ascending (oldest first).
    """
    open_qs = [q for q in questions if q["status"] in ("open", "answered")]
    open_qs.sort(key=lambda q: (not q["blocking"], q["created_at"]))

    lines = ["# Coord Inbox", ""]
    if not open_qs:
        lines.append("_No open questions._")
    else:
        for q in open_qs:
            flag = "🚨 BLOCKING" if q["blocking"] else "💭 non-blocking"
            lines.append(f"## {flag} — `{q['scope']}`")
            lines.append("")
            lines.append(f"**From:** `{q['asker_agent']}` → `{q['target']}`")
            lines.append(f"**ID:** `{q['id']}` · **Asked:** {q['created_at']}")
            lines.append("")
            lines.append(f"> {q['asks']}")
            if q.get("answer"):
                lines.append("")
                lines.append(f"**Answer ({q.get('resolved_by', '?')})**: {q['answer']}")
            lines.append("")
            lines.append("---")
            lines.append("")

    content = "\n".join(lines)
    async with file_lock:
        async with aiofiles.open(config.INBOX_PATH, mode="w", encoding="utf-8") as f:
            await f.write(content)
            await f.flush()
            await asyncio.to_thread(os.fsync, f.fileno())


# ----------------------------------------------------------------------
# Convenience helpers
# ----------------------------------------------------------------------

@asynccontextmanager
async def transaction() -> AsyncIterator[aiosqlite.Connection]:
    """Acquire db_lock and yield the connection. Caller commits explicitly.

    Usage:
        async with transaction() as conn:
            await conn.execute(...)
            await conn.commit()
    """
    async with db_lock:
        yield db()
