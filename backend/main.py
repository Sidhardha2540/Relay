"""Coord daemon — FastAPI entry point.

Run with:
    cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 49152

Or simply:
    cd backend && python main.py

Endpoints:
    GET  /healthz                         → liveness
    POST /api/register                    → register agent/human (NEW)
    GET  /api/state                       → full snapshot or delta (since_id)
    POST /api/intents                     → claim_intent
    DELETE /api/intents/{id}              → release_intent
    POST /api/decisions                   → commit_decision
    POST /api/discoveries                 → share_discovery
    POST /api/questions                   → raise_question
    POST /api/questions/{id}/answer       → answer_question
    POST /api/questions/{id}/resolve      → resolve_question
    WS   /ws                              → live event stream

Agent identity:
    All mutating endpoints require the X-Coord-Agent-Id header.
    The MCP shim sets it from $COORD_AGENT_ID.
    Agents must also call POST /api/register before any mutation — the scope
    checks in state_engine return 403 for unregistered agents.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
import sys
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config, state_engine, storage, ws_broadcast
from .models import (
    AnswerQuestionRequest,
    ClaimIntentRequest,
    CommitDecisionRequest,
    Limits,
    ParticipantRegistration,
    RaiseQuestionRequest,
    ResolveQuestionRequest,
    ShareDiscoveryRequest,
    now_iso,
)

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# In-memory rate limiting state
# agent_id → list of call timestamps (epoch float, within last 60 s)
# ----------------------------------------------------------------------
rate_tracker: dict[str, list[float]] = {}

# agent_id → Limits (populated on register, reloaded from DB on miss)
_limits_cache: dict[str, Limits] = {}

DEFAULT_LIMITS = Limits()   # max_calls_per_min=20, max_state_size_kb=100, alert=0.8


async def _get_limits(agent_id: str) -> Limits:
    """Return cached Limits for agent, falling back to DB then defaults."""
    if agent_id in _limits_cache:
        return _limits_cache[agent_id]
    conn = storage.db()
    cur = await conn.execute(
        "SELECT limits FROM participants WHERE agent_id = ?", (agent_id,)
    )
    row = await cur.fetchone()
    await cur.close()
    if row:
        try:
            raw = json.loads(row["limits"])
            lim = Limits(**raw)
            _limits_cache[agent_id] = lim
            return lim
        except Exception:
            pass
    return DEFAULT_LIMITS


def _check_rate(agent_id: str, max_calls: int) -> bool:
    """Return True if agent is within rate limit, False if exceeded.

    Prunes stale timestamps (>60 s old) on every call.
    """
    now = time.monotonic()
    calls = rate_tracker.get(agent_id, [])
    calls = [t for t in calls if now - t < 60.0]   # prune old
    rate_tracker[agent_id] = calls

    if len(calls) >= max_calls:
        return False
    calls.append(now)
    return True


# ----------------------------------------------------------------------
# Lifespan: bootstrap and teardown
# ----------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    await storage.init_storage()
    # Warm up the inbox file so editors auto-detect it.
    state = await state_engine.get_state()
    await storage.regenerate_inbox(state["questions"])
    yield
    await storage.close_storage()


app = FastAPI(
    title="Coord — Agent Coordination Daemon",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_ORIGIN],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def require_agent(x_coord_agent_id: str | None) -> str:
    if not x_coord_agent_id:
        raise HTTPException(
            status_code=400,
            detail="X-Coord-Agent-Id header is required",
        )
    return x_coord_agent_id


async def require_registered_agent(x_coord_agent_id: str | None) -> str:
    """Require that the agent header is present AND registered.

    Returns agent_id on success.  Raises 400 if missing or unregistered.
    """
    agent = require_agent(x_coord_agent_id)
    conn = storage.db()
    cur = await conn.execute(
        "SELECT agent_id FROM participants WHERE agent_id = ?", (agent,)
    )
    row = await cur.fetchone()
    await cur.close()
    if row is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Agent '{agent}' is not registered. "
                "Call POST /api/register before any other endpoint."
            ),
        )
    return agent


async def require_registered_with_rate_check(x_coord_agent_id: str | None) -> str:
    """require_registered_agent + rate limiting.  Used by all mutation endpoints."""
    agent = await require_registered_agent(x_coord_agent_id)
    limits = await _get_limits(agent)
    if not _check_rate(agent, limits.max_calls_per_min):
        raise HTTPException(
            status_code=429,
            detail=(
                f"Rate limit exceeded for agent '{agent}'. "
                f"Max {limits.max_calls_per_min} calls/min. "
                "Wait up to 60 s and retry."
            ),
        )
    return agent


def _result_to_response(result: dict) -> JSONResponse:
    """Translate state_engine results into HTTP status codes.

    Conflicts map to their numeric code so HTTP clients (including curl)
    see the right status without parsing JSON.
    """
    if result.get("status") == "conflict":
        code = int(result.get("code", 409))
        return JSONResponse(status_code=code, content=result)
    return JSONResponse(status_code=200, content=result)


def _uri_scope_matches_registration(registered: str, candidate: str) -> bool:
    """Reuse the same prefix matching logic as state_engine for registration
    conflict detection.  Exact copy so main.py stays self-contained.
    """
    reg = registered.rstrip("/")
    can = candidate.rstrip("/")
    if reg == can:
        return True
    return can.startswith(reg + "/") or reg.startswith(can + "/")


# ----------------------------------------------------------------------
# Health
# ----------------------------------------------------------------------

@app.get("/healthz")
async def healthz():
    return {
        "status": "ok",
        "server_time": now_iso(),
        "ws_clients": ws_broadcast.manager.count,
    }


# ----------------------------------------------------------------------
# Registration (NEW)
# ----------------------------------------------------------------------

@app.post("/api/register")
async def register_participant(body: ParticipantRegistration):
    """Register an agent or human with their scope and limits.

    Success  → 200  {"status": "registered", ...}
    Conflict → 409  {"status": "conflict", "conflicting_agent": ..., ...}
               (also auto-injects a non-blocking Question to human)
    Bad data → 400  (Pydantic validation)

    Call this once at session start before any mutation endpoint.
    Re-registering the same agent_id overwrites the prior registration.
    """
    conn = storage.db()

    if body.mode == "exclusive":
        # Check whether any currently-registered exclusive agent owns an
        # overlapping scope.
        cur = await conn.execute(
            "SELECT agent_id, scope, mode FROM participants WHERE mode = 'exclusive'",
        )
        rows = await cur.fetchall()
        await cur.close()

        for row in rows:
            if row["agent_id"] == body.agent_id:
                # Same agent re-registering — allow (overwrite below).
                continue
            existing_scopes: list[str] = json.loads(row["scope"])
            for ex_scope in existing_scopes:
                for req_scope in body.scope:
                    if _uri_scope_matches_registration(ex_scope, req_scope):
                        # Conflict — auto-raise a non-blocking question and return 409.
                        await state_engine.raise_question(
                            scope=req_scope,
                            asks=(
                                f"Registration conflict: agent '{body.agent_id}' requested "
                                f"scope '{req_scope}' which overlaps '{ex_scope}' owned by "
                                f"'{row['agent_id']}' (exclusive). Human review required."
                            ),
                            asker_agent="coord_daemon",
                            target="human",
                            blocking=False,
                        )
                        return JSONResponse(
                            status_code=409,
                            content={
                                "status": "conflict",
                                "agent_id": body.agent_id,
                                "code": 409,
                                "conflicting_agent": row["agent_id"],
                                "conflicting_scope": ex_scope,
                                "requested_scope": req_scope,
                                "detail": (
                                    f"Scope '{req_scope}' overlaps exclusive scope "
                                    f"'{ex_scope}' held by '{row['agent_id']}'."
                                ),
                            },
                        )

    # Upsert participant (overwrite on re-registration).
    async with storage.transaction() as db_conn:
        await db_conn.execute(
            """
            INSERT INTO participants
              (agent_id, type, task, scope, role_tag, mode, limits, registered_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(agent_id) DO UPDATE SET
              type         = excluded.type,
              task         = excluded.task,
              scope        = excluded.scope,
              role_tag     = excluded.role_tag,
              mode         = excluded.mode,
              limits       = excluded.limits,
              registered_at = excluded.registered_at
            """,
            (
                body.agent_id,
                body.type,
                body.task,
                json.dumps(body.scope),
                body.role_tag,
                body.mode,
                json.dumps(body.limits.model_dump()),
                now_iso(),
            ),
        )
        await db_conn.commit()

    # Cache limits so rate checking is zero-latency after registration.
    _limits_cache[body.agent_id] = body.limits

    await storage.append_log({
        "type": "participant_registered",
        "agent_id": body.agent_id, "type": body.type,
        "task": body.task, "scope": body.scope,
        "role_tag": body.role_tag, "mode": body.mode,
        "ts": now_iso(),
    })

    return JSONResponse(
        status_code=200,
        content={
            "status": "registered",
            "agent_id": body.agent_id,
            "scope": body.scope,
            "mode": body.mode,
        },
    )


# ----------------------------------------------------------------------
# State snapshot (updated: since_id delta + payload capping)
# ----------------------------------------------------------------------

@app.get("/api/state")
async def get_state(
    scope: Optional[str] = None,
    since_id: Optional[int] = None,
    x_coord_agent_id: Optional[str] = Header(default=None),
):
    """Return a full snapshot or a delta since a given sequence id.

    Query params:
      scope     — narrow to a single scope prefix (optional)
      since_id  — return only records with sequence > since_id (optional)
                  Omit or pass 0 for a full snapshot.

    Payload capping (per registered agent's limits):
      At alert_threshold  → response includes {"_payload_warning": true}
      Above max_state_size_kb → response truncated per type + non-blocking
                                Question raised to human.
    """
    state = await state_engine.get_state(scope_filter=scope, since_id=since_id)
    payload = {**state, "server_time": now_iso()}

    # Payload capping — only enforced when agent is identified and registered.
    if x_coord_agent_id:
        limits = await _get_limits(x_coord_agent_id)
        raw_size = len(json.dumps(payload).encode())
        cap_bytes = limits.max_state_size_kb * 1024
        warn_bytes = int(cap_bytes * limits.alert_threshold)

        if raw_size >= cap_bytes:
            # Truncate each list to the 20 most-recent items and add a warning.
            TRUNC = 20
            payload["decisions"]   = payload["decisions"][-TRUNC:]
            payload["discoveries"] = payload["discoveries"][:TRUNC]
            payload["intents"]     = payload["intents"][:TRUNC]
            payload["questions"]   = payload["questions"][:TRUNC]
            payload["_payload_truncated"] = True
            payload["_payload_size_kb"]   = round(raw_size / 1024, 1)

            # Non-blocking question to human so they know pruning happened.
            await state_engine.raise_question(
                scope="virt://coord/state",
                asks=(
                    f"State payload for agent '{x_coord_agent_id}' exceeded "
                    f"{limits.max_state_size_kb} KB ({round(raw_size/1024, 1)} KB). "
                    "Response was truncated. Human intervention may be needed to "
                    "prune stale decisions/discoveries."
                ),
                asker_agent="coord_daemon",
                target="human",
                blocking=False,
            )
        elif raw_size >= warn_bytes:
            payload["_payload_warning"] = True
            payload["_payload_size_kb"] = round(raw_size / 1024, 1)
            payload["_payload_limit_kb"] = limits.max_state_size_kb

    return payload


# ----------------------------------------------------------------------
# Intents
# ----------------------------------------------------------------------

@app.post("/api/intents")
async def post_intent(
    body: ClaimIntentRequest,
    x_coord_agent_id: str | None = Header(default=None),
):
    agent = await require_registered_with_rate_check(x_coord_agent_id)
    result = await state_engine.claim_intent(
        scope=body.scope,
        action=body.action,
        agent=agent,
        ttl_minutes=body.ttl_minutes,
    )
    return _result_to_response(result)


@app.delete("/api/intents/{intent_id}")
async def delete_intent(
    intent_id: str,
    x_coord_agent_id: str | None = Header(default=None),
):
    agent = await require_registered_with_rate_check(x_coord_agent_id)
    result = await state_engine.release_intent(intent_id, agent)
    return _result_to_response(result)


# ----------------------------------------------------------------------
# Decisions
# ----------------------------------------------------------------------

@app.post("/api/decisions")
async def post_decision(
    body: CommitDecisionRequest,
    x_coord_agent_id: str | None = Header(default=None),
):
    agent = await require_registered_with_rate_check(x_coord_agent_id)
    result = await state_engine.commit_decision(
        scope=body.scope,
        key=body.key,
        value=body.value,
        agent=agent,
        anchor=body.anchor,
        rationale=body.rationale,
    )
    return _result_to_response(result)


# ----------------------------------------------------------------------
# Discoveries
# ----------------------------------------------------------------------

@app.post("/api/discoveries")
async def post_discovery(
    body: ShareDiscoveryRequest,
    x_coord_agent_id: str | None = Header(default=None),
):
    agent = await require_registered_with_rate_check(x_coord_agent_id)
    result = await state_engine.share_discovery(
        scope=body.scope,
        summary=body.summary,
        agent=agent,
        file_hash=body.file_hash,
        confidence=body.confidence,
    )
    return _result_to_response(result)


# ----------------------------------------------------------------------
# Questions
# ----------------------------------------------------------------------

@app.post("/api/questions")
async def post_question(
    body: RaiseQuestionRequest,
    x_coord_agent_id: str | None = Header(default=None),
):
    # Questions exempt from registration requirement — humans and agents
    # without full scope may still raise questions.
    agent = require_agent(x_coord_agent_id)
    result = await state_engine.raise_question(
        scope=body.scope,
        asks=body.asks,
        asker_agent=agent,
        target=body.target,
        blocking=body.blocking,
    )
    return _result_to_response(result)


@app.post("/api/questions/{question_id}/answer")
async def post_answer(
    question_id: str,
    body: AnswerQuestionRequest,
    x_coord_agent_id: str | None = Header(default=None),
):
    # Humans answer too — agent header required but registration not enforced.
    agent = require_agent(x_coord_agent_id)
    result = await state_engine.answer_question(
        question_id=question_id, answer=body.answer, resolved_by=agent
    )
    return _result_to_response(result)


@app.post("/api/questions/{question_id}/resolve")
async def post_resolve(
    question_id: str,
    body: ResolveQuestionRequest,
    x_coord_agent_id: str | None = Header(default=None),
):
    agent = require_agent(x_coord_agent_id)
    result = await state_engine.resolve_question(
        question_id=question_id, resolution=body.resolution, resolved_by=agent
    )
    return _result_to_response(result)


# ----------------------------------------------------------------------
# Demo utilities
# ----------------------------------------------------------------------

@app.post("/api/_demo/replay")
async def replay_demo(
    x_coord_agent_id: str | None = Header(default=None),
):
    require_agent(x_coord_agent_id)
    if not config.ENABLE_DEMO_REPLAY:
        raise HTTPException(status_code=403, detail="Demo replay is disabled")

    script = Path(__file__).resolve().parent.parent / "demo" / "seed_demo.py"
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        str(script),
        "--live",
    )
    return {"status": "accepted", "pid": proc.pid}


# ----------------------------------------------------------------------
# WebSocket
# ----------------------------------------------------------------------

@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await ws_broadcast.manager.connect(websocket)
    try:
        # Initial snapshot — clients render immediately, no flicker.
        snapshot = await state_engine.get_state()
        await ws_broadcast.manager.send_to(
            websocket, "state_snapshot",
            {**snapshot, "server_time": now_iso()},
        )
        # Keep the socket alive. We don't expect inbound messages, but FastAPI
        # closes the socket if we don't await something.
        while True:
            # The dashboard may send pings; we ignore content.
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                raise
            except Exception:
                # Stay alive on parse errors.
                await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    finally:
        await ws_broadcast.manager.disconnect(websocket)


# ----------------------------------------------------------------------
# CLI entry — `python main.py`
# ----------------------------------------------------------------------

if __name__ == "__main__":
    # Pass the app object directly (not a string path) so we don't trigger
    # a double import when launched via `python -m backend.main`.
    import uvicorn
    uvicorn.run(
        app,
        host=config.HOST,
        port=config.PORT,
        log_level="info",
    )
