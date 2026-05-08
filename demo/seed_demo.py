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
    print(f"  {color_agent(agent)} {method} {path:<40} -> {resp.status_code} {data.get('status', '')}")
    return data


async def seed_baseline(client: httpx.AsyncClient) -> None:
    """Idempotent baseline: one decision, one discovery, one intent."""
    print("--- seeding baseline state ---")
    await call(client, "POST", "/api/discoveries", "claude-code", {
        "scope": "auth/middleware.ts",
        "summary": "Exports verifyJWT(token: string): JWTPayload at line 14. Uses jsonwebtoken@9.x.",
        "file_hash": "sha256:abc123def456",
        "confidence": "verified",
    })
    await call(client, "POST", "/api/decisions", "claude-code", {
        "scope": "auth",
        "key": "token_validator_name",
        "value": "verifyJWT",
        "rationale": "Already exported by middleware.ts; matches existing call sites.",
    })
    await call(client, "POST", "/api/intents", "cursor", {
        "scope": "frontend/components/auth/",
        "action": "Wire up the login form to call /api/auth/verify and handle 401s.",
        "ttl_minutes": 10,
    })


async def narrate_conflict(client: httpx.AsyncClient) -> None:
    """The dramatic sequence: Cursor tries to redefine the contract."""
    print("\n--- live conflict sequence ---")

    print("\n[1] Cursor reads a stale view and tries to commit a different name.")
    await asyncio.sleep(2)
    res = await call(client, "POST", "/api/decisions", "cursor", {
        "scope": "auth",
        "key": "token_validator_name",
        "value": "validateToken",
        "rationale": "Reads better in the frontend hook.",
    })
    assert res.get("code") == 409, f"expected 409 conflict, got: {res}"

    print("\n[2] Cursor responds correctly - raises the question with the suggested text.")
    await asyncio.sleep(2)
    q = await call(client, "POST", "/api/questions", "cursor", {
        "scope": "auth::token_validator_name",
        "asks": res.get("suggested_question", "Conflict on naming."),
        "target": "human",
        "blocking": True,
    })
    qid = q.get("id")

    print("\n[3] (Dashboard pulses red - blocking question in inbox.)")
    await asyncio.sleep(4)

    print("\n[4] Human resolves: keep the existing decision.")
    await call(client, "POST", f"/api/questions/{qid}/resolve", "human", {
        "resolution": "Keep verifyJWT - already used by 4 other call sites.",
    })

    print("\n[5] Claude finishes its work, releases its scope.")
    state = await call(client, "GET", "/api/state", "human")
    own = [i for i in state.get("intents", []) if i["agent"] == "claude-code"]
    if own:
        await call(client, "DELETE", f"/api/intents/{own[0]['id']}", "claude-code")
    else:
        print("  (claude-code had no active intents to release)")

    print("\n[6] Discovery becomes stale - the file got edited.")
    await asyncio.sleep(2)
    await call(client, "POST", "/api/discoveries", "claude-code", {
        "scope": "auth/middleware.ts",
        "summary": "Exports verifyJWT(token, opts?: VerifyOpts) - added optional second arg.",
        "file_hash": "sha256:newer-hash-789",
        "confidence": "verified",
    })

    print("\n--- done. Dashboard should show ~10 events on the timeline. ---")


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

