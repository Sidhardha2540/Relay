"""Coord daemon — FastAPI entry point.

Run with:
    cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 49152

Or simply:
    cd backend && python main.py

Endpoints:
    GET  /healthz                         → liveness
    GET  /api/state                       → full snapshot
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
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
import sys

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config, state_engine, storage, ws_broadcast
from .models import (
    AnswerQuestionRequest,
    ClaimIntentRequest,
    CommitDecisionRequest,
    RaiseQuestionRequest,
    ResolveQuestionRequest,
    ShareDiscoveryRequest,
    now_iso,
)


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
    version="0.1.0",
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


def _result_to_response(result: dict) -> JSONResponse:
    """Translate state_engine results into HTTP status codes.

    Conflicts map to their numeric code so HTTP clients (including curl)
    see the right status without parsing JSON.
    """
    if result.get("status") == "conflict":
        code = int(result.get("code", 409))
        return JSONResponse(status_code=code, content=result)
    return JSONResponse(status_code=200, content=result)


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
# State snapshot
# ----------------------------------------------------------------------

@app.get("/api/state")
async def get_state(scope: str | None = None):
    state = await state_engine.get_state(scope_filter=scope)
    return {**state, "server_time": now_iso()}


# ----------------------------------------------------------------------
# Intents
# ----------------------------------------------------------------------

@app.post("/api/intents")
async def post_intent(
    body: ClaimIntentRequest,
    x_coord_agent_id: str | None = Header(default=None),
):
    agent = require_agent(x_coord_agent_id)
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
    agent = require_agent(x_coord_agent_id)
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
    agent = require_agent(x_coord_agent_id)
    result = await state_engine.commit_decision(
        scope=body.scope,
        key=body.key,
        value=body.value,
        agent=agent,
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
    agent = require_agent(x_coord_agent_id)
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
    # Note: humans answer too — we accept "human" as a valid agent id.
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
