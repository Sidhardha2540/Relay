"""One-shot wipe of Coord SQLite + inbox/log (daemon should be stopped)."""
from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED = ROOT / ".shared"
DB = SHARED / "state.db"


def main() -> None:
    SHARED.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB)
    conn.execute("DELETE FROM participants")
    conn.execute("DELETE FROM decisions")
    conn.execute("DELETE FROM discoveries")
    conn.execute("DELETE FROM intents")
    conn.execute("DELETE FROM questions")
    conn.execute("UPDATE sequence_counter SET value = 0 WHERE id = 1")
    conn.commit()

    p = conn.execute("SELECT count(*) FROM participants").fetchone()[0]
    d = conn.execute("SELECT count(*) FROM decisions").fetchone()[0]
    q = conn.execute("SELECT count(*) FROM questions").fetchone()[0]
    print(f"DB clean — participants:{p} decisions:{d} questions:{q}")
    conn.close()

    inbox = SHARED / "inbox.md"
    inbox.write_text("# Coord Inbox\n\n_No open questions._\n", encoding="utf-8")
    log = SHARED / "log.jsonl"
    log.write_text("", encoding="utf-8")
    print("Inbox and log cleared.")
    print("Done — clean slate.")


if __name__ == "__main__":
    main()
