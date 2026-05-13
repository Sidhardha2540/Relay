"""Seed the daemon with realistic demo state, then narrate a 60-second
sequence of conflicts and resolutions. Use for the LinkedIn video.

Usage:
    python demo/seed_demo.py            # one-shot seed
    python demo/seed_demo.py --live     # narrated live sequence (sleeps between events)

Requires: the daemon running on http://127.0.0.1:49152.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from typing import Any

import httpx

BASE = "http://127.0.0.1:49152"
RESET = "\033[0m"
AGENT_COLORS = {
    "claude-code": "\033[38;5;214m",
    "cursor": "\033[38;5;39m",
    "aider": "\033[38;5;42m",
    "human": "\033[38;5;196m",
}


def color_agent(agent: str) -> str:
    return f"{AGENT_COLORS.get(agent, '')}{agent:>12}{RESET}"


async def call(
    client: httpx.AsyncClient, method: str, path: str, agent: str,
    body: dict | None = None,
) -> dict[str, Any]:
    headers = {"X-Coord-Agent-Id": agent, "Content-Type": "application/json"}
    resp = await client.request(method, f"{BASE}{path}", headers=headers, json=body)
    try:
        data = resp.json()
    except json.JSONDecodeError:
        data = {"http_status": resp.status_code, "text": resp.text[:200]}
    status_str = data.get('status', '') or data.get('detail', '') or ''
    if resp.status_code >= 400:
        print(f"  {color_agent(agent)} {method} {path:<40} -> {resp.status_code} ERROR: {data}")
    else:
        print(f"  {color_agent(agent)} {method} {path:<40} -> {resp.status_code} {status_str}")
    return data


async def seed_baseline(client: httpx.AsyncClient) -> None:
    """Idempotent baseline: todo-app scenario matching the LinkedIn video."""
    print("--- registering agents ---")
    await call(client, "POST", "/api/register", "claude-code", {
        "agent_id": "claude-code",
        "type": "agent",
        "task": "Add TodoUpdate model and PUT /todos/{id} + DELETE /todos/{id} endpoints.",
        "scope": ["main.py", "models.py"],
    })
    await call(client, "POST", "/api/register", "cursor", {
        "agent_id": "cursor",
        "type": "agent",
        "task": "Refactor main.py to use SQLAlchemy ORM and add database session handling.",
        "scope": ["main.py", "database.py"],
    })
    await call(client, "POST", "/api/register", "aider", {
        "agent_id": "aider",
        "type": "agent",
        "task": "Write pytest tests for all CRUD endpoints.",
        "scope": ["tests/"],
    })
    print("--- seeding baseline state ---")
    await call(client, "POST", "/api/discoveries", "claude-code", {
        "scope": "main.py",
        "summary": "In-memory todos list at line 8. GET /todos and POST /todos defined. No PUT or DELETE yet.",
        "file_hash": "sha256:abc123def456",
        "confidence": "verified",
    })
    await call(client, "POST", "/api/decisions", "claude-code", {
        "scope": "main.py",
        "key": "todo_storage_backend",
        "value": "in_memory_list",
        "rationale": "Current implementation uses a plain Python list. Keeping it consistent until ORM migration is agreed.",
    })
    await call(client, "POST", "/api/intents", "cursor", {
        "scope": "main.py",
        "action": "Rewrite main.py to use SQLAlchemy ORM — replaces in-memory list with DB session.",
        "ttl_minutes": 10,
    })


async def narrate_conflict(client: httpx.AsyncClient) -> None:
    """The dramatic sequence: Cursor tries to redefine storage backend while Claude already locked it."""
    print("\n--- live conflict sequence ---")

    print("\n[1] Cursor claims main.py scope and tries to commit a conflicting storage decision.")
    await asyncio.sleep(2)
    # cursor already has intent on main.py from baseline — now tries to override the storage decision
    res = await call(client, "POST", "/api/decisions", "cursor", {
        "scope": "main.py",
        "key": "todo_storage_backend",
        "value": "sqlalchemy_orm",
        "rationale": "ORM is cleaner and the whole point of this task.",
    })
    assert res.get("code") == 409, f"expected 409 conflict, got: {res}"

    print("\n[2] Cursor raises a blocking question for the human to resolve.")
    await asyncio.sleep(2)
    q = await call(client, "POST", "/api/questions", "cursor", {
        "scope": "main.py::todo_storage_backend",
        "asks": res.get("suggested_question",
            "claude-code locked todo_storage_backend=in_memory_list. "
            "Cursor wants sqlalchemy_orm. Which should we use?"),
        "target": "human",
        "blocking": True,
    })
    qid = q.get("id")

    print("\n[3] (Dashboard inbox shows blocking question - both agents paused.)")
    await asyncio.sleep(4)

    print("\n[4] Human resolves: switch to SQLAlchemy - that was always the plan.")
    await call(client, "POST", f"/api/questions/{qid}/resolve", "human", {
        "resolution": "Use SQLAlchemy ORM. Claude-code should update its endpoints to use the DB session instead of the in-memory list.",
    })

    print("\n[5] Claude-code releases main.py scope after completing its endpoints.")
    state = await call(client, "GET", "/api/state", "human")
    own = [i for i in state.get("intents", []) if i["agent"] == "claude-code"]
    if own:
        await call(client, "DELETE", f"/api/intents/{own[0]['id']}", "claude-code")
    else:
        print("  (claude-code had no active intents to release)")

    print("\n[6] Cursor posts updated discovery after ORM rewrite.")
    await asyncio.sleep(2)
    await call(client, "POST", "/api/discoveries", "cursor", {
        "scope": "main.py",
        "summary": "Rewritten with SQLAlchemy. SessionLocal at line 12. All endpoints use db: Session = Depends(get_db).",
        "file_hash": "sha256:newer-hash-sqlalchemy",
        "confidence": "verified",
    })

    print("\n--- done. Dashboard should show agents, scope graph, decision ledger, and resolved conflict. ---")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="run the narrated sequence")
    args = parser.parse_args()

    # trust_env=False: ignore system proxy settings (e.g. socks5h) that httpx
    # cannot handle without extra dependencies.
    async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
        try:
            await client.get(f"{BASE}/healthz")
        except Exception as e:
            print(f"daemon not reachable at {BASE} - start it with: python -m backend.main")
            print(f"error: {e}")
            sys.exit(1)

        await seed_baseline(client)
        if args.live:
            await narrate_conflict(client)


if __name__ == "__main__":
    asyncio.run(main())

