"""Coord MCP shim — one process per agent.

Each agent's IDE config spawns this file as a stdio MCP server. The shim:
  1. Reads its identity from $COORD_AGENT_ID (e.g., "claude-code", "cursor").
  2. Exposes the 8 Coord tools as MCP tools.
  3. Proxies every call to the daemon's HTTP API at $COORD_BASE_URL.
  4. Returns the daemon's response verbatim — including conflict codes —
     so the agent sees real 409/410/423 semantics, not a sanitized success.

Why per-agent processes:
  MCP is stdio-based. A single MCP server can serve only one client at a time.
  Spawning one shim per agent gives each agent its own MCP transport, while
  the daemon remains the single source of truth. Identity is set in the
  shim's environment — the agent cannot spoof another agent's ID.

Configure in your IDE:
    {
      "mcpServers": {
        "coord": {
          "command": "python",
          "args": ["/abs/path/to/coord/mcp-shim/shim.py"],
          "env": {
            "COORD_AGENT_ID": "claude-code",
            "COORD_BASE_URL": "http://127.0.0.1:49152"
          }
        }
      }
    }
"""
from __future__ import annotations

import json
import os
from typing import Any

import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool


AGENT_ID = os.environ.get("COORD_AGENT_ID", "unknown-agent")
BASE_URL = os.environ.get("COORD_BASE_URL", "http://127.0.0.1:49152").rstrip("/")
DEFAULT_TIMEOUT = 10.0


def _headers() -> dict[str, str]:
    return {"X-Coord-Agent-Id": AGENT_ID, "Content-Type": "application/json"}


async def _request(method: str, path: str, body: dict | None = None) -> dict[str, Any]:
    """One HTTP call to the daemon. Returns parsed JSON; HTTP error codes are
    surfaced inside the JSON body (the daemon always returns JSON)."""
    url = f"{BASE_URL}{path}"
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        resp = await client.request(
            method=method,
            url=url,
            headers=_headers(),
            content=json.dumps(body) if body is not None else None,
        )
        try:
            return resp.json()
        except json.JSONDecodeError:
            return {
                "status": "error",
                "code": resp.status_code,
                "detail": resp.text[:500],
            }


def _ok(payload: dict) -> list[TextContent]:
    return [TextContent(type="text", text=json.dumps(payload, indent=2))]


# ----------------------------------------------------------------------
# Tool catalog
# ----------------------------------------------------------------------

TOOLS: list[Tool] = [
    Tool(
        name="read_state",
        description=(
            "Snapshot of all four shared stores: decisions, discoveries, "
            "intents, questions. Pass `scope_filter` to narrow. Call this at "
            "the start of any non-trivial task."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "scope_filter": {"type": "string"},
            },
        },
    ),
    Tool(
        name="claim_intent",
        description=(
            "Claim a TTL lease on a scope before working on it. Returns 423 "
            "if another agent already holds an overlapping scope. Returns "
            "429 if you have too many active intents (release one first)."
        ),
        inputSchema={
            "type": "object",
            "required": ["scope", "action"],
            "properties": {
                "scope": {"type": "string"},
                "action": {"type": "string"},
                "ttl_minutes": {"type": "integer", "minimum": 1, "maximum": 120},
            },
        },
    ),
    Tool(
        name="release_intent",
        description="Release an active intent. Only the owning agent can release.",
        inputSchema={
            "type": "object",
            "required": ["intent_id"],
            "properties": {"intent_id": {"type": "string"}},
        },
    ),
    Tool(
        name="commit_decision",
        description=(
            "Record a contract (FWW). Returns 409 if a different value already "
            "exists for the same scope::key. On 409, raise a question — do not "
            "retry automatically."
        ),
        inputSchema={
            "type": "object",
            "required": ["scope", "key", "value"],
            "properties": {
                "scope": {"type": "string"},
                "key": {"type": "string"},
                "value": {"type": "string"},
                "rationale": {"type": "string"},
            },
        },
    ),
    Tool(
        name="share_discovery",
        description=(
            "Share an observation about the codebase (LWW). Includes file_hash "
            "so peers can detect when this discovery becomes stale."
        ),
        inputSchema={
            "type": "object",
            "required": ["scope", "summary"],
            "properties": {
                "scope": {"type": "string"},
                "summary": {"type": "string"},
                "file_hash": {"type": "string"},
                "confidence": {
                    "type": "string",
                    "enum": ["unverified", "verified", "contradicted"],
                },
            },
        },
    ),
    Tool(
        name="raise_question",
        description=(
            "Escalate a blocker to the human (target='human') or another "
            "agent. Use blocking=true if you cannot proceed without an answer."
        ),
        inputSchema={
            "type": "object",
            "required": ["scope", "asks"],
            "properties": {
                "scope": {"type": "string"},
                "asks": {"type": "string"},
                "target": {"type": "string", "default": "human"},
                "blocking": {"type": "boolean", "default": True},
            },
        },
    ),
    Tool(
        name="answer_question",
        description="Answer an open question. The question moves to 'answered' status.",
        inputSchema={
            "type": "object",
            "required": ["question_id", "answer"],
            "properties": {
                "question_id": {"type": "string"},
                "answer": {"type": "string"},
            },
        },
    ),
    Tool(
        name="resolve_question",
        description="Mark a question fully resolved. Final close.",
        inputSchema={
            "type": "object",
            "required": ["question_id", "resolution"],
            "properties": {
                "question_id": {"type": "string"},
                "resolution": {"type": "string"},
            },
        },
    ),
]


# ----------------------------------------------------------------------
# Tool dispatch — every call becomes one HTTP request
# ----------------------------------------------------------------------

async def call_tool(name: str, args: dict[str, Any]) -> list[TextContent]:
    if name == "read_state":
        scope = args.get("scope_filter")
        path = "/api/state" + (f"?scope={scope}" if scope else "")
        return _ok(await _request("GET", path))

    if name == "claim_intent":
        return _ok(await _request("POST", "/api/intents", {
            "scope": args["scope"],
            "action": args["action"],
            "ttl_minutes": args.get("ttl_minutes", 10),
        }))

    if name == "release_intent":
        return _ok(await _request(
            "DELETE", f"/api/intents/{args['intent_id']}"
        ))

    if name == "commit_decision":
        return _ok(await _request("POST", "/api/decisions", {
            "scope": args["scope"],
            "key": args["key"],
            "value": args["value"],
            "rationale": args.get("rationale"),
        }))

    if name == "share_discovery":
        return _ok(await _request("POST", "/api/discoveries", {
            "scope": args["scope"],
            "summary": args["summary"],
            "file_hash": args.get("file_hash"),
            "confidence": args.get("confidence", "unverified"),
        }))

    if name == "raise_question":
        return _ok(await _request("POST", "/api/questions", {
            "scope": args["scope"],
            "asks": args["asks"],
            "target": args.get("target", "human"),
            "blocking": args.get("blocking", True),
        }))

    if name == "answer_question":
        return _ok(await _request(
            "POST", f"/api/questions/{args['question_id']}/answer",
            {"answer": args["answer"]},
        ))

    if name == "resolve_question":
        return _ok(await _request(
            "POST", f"/api/questions/{args['question_id']}/resolve",
            {"resolution": args["resolution"]},
        ))

    return _ok({"status": "error", "detail": f"unknown tool: {name}"})


# ----------------------------------------------------------------------
# MCP server boot
# ----------------------------------------------------------------------

server: Server = Server("coord-shim")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return TOOLS


@server.call_tool()
async def handle_call(name: str, args: dict[str, Any]) -> list[TextContent]:
    return await call_tool(name, args or {})


async def main() -> None:
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
