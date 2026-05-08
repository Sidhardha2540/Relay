"""Pydantic models — shared between HTTP API, WebSocket events, and storage layer."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional, Any
from pydantic import BaseModel, Field


def now_iso() -> str:
    """UTC ISO-8601 with 'Z' suffix. Used everywhere as the canonical timestamp format."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


# ----------------------------------------------------------------------
# Domain entities
# ----------------------------------------------------------------------

class Decision(BaseModel):
    scope: str
    key: str
    value: str
    agent: str
    rationale: Optional[str] = None
    created_at: str
    sequence: int


class Discovery(BaseModel):
    id: str
    scope: str
    summary: str
    file_hash: Optional[str] = None
    agent: str
    confidence: Literal["unverified", "verified", "contradicted"] = "unverified"
    created_at: str
    superseded: bool = False


class Intent(BaseModel):
    id: str
    scope: str
    action: str
    agent: str
    created_at: str
    expires_at: str
    status: Literal["active", "expired", "released", "completed"] = "active"


class Question(BaseModel):
    id: str
    scope: str
    asks: str
    asker_agent: str
    target: str
    blocking: bool = True
    status: Literal["open", "answered", "resolved", "deferred"] = "open"
    answer: Optional[str] = None
    resolved_by: Optional[str] = None
    created_at: str
    resolved_at: Optional[str] = None


# ----------------------------------------------------------------------
# Request bodies (HTTP API in)
# ----------------------------------------------------------------------

class ClaimIntentRequest(BaseModel):
    scope: str
    action: str
    ttl_minutes: int = Field(default=10, ge=1, le=120)


class CommitDecisionRequest(BaseModel):
    scope: str
    key: str
    value: str
    rationale: Optional[str] = None


class ShareDiscoveryRequest(BaseModel):
    scope: str
    summary: str
    file_hash: Optional[str] = None
    confidence: Literal["unverified", "verified", "contradicted"] = "unverified"


class RaiseQuestionRequest(BaseModel):
    scope: str
    asks: str
    target: str = "human"
    blocking: bool = True


class AnswerQuestionRequest(BaseModel):
    answer: str


class ResolveQuestionRequest(BaseModel):
    resolution: str


# ----------------------------------------------------------------------
# Responses (HTTP API out)
# ----------------------------------------------------------------------

class StateSnapshot(BaseModel):
    decisions: list[Decision]
    discoveries: list[Discovery]
    intents: list[Intent]
    questions: list[Question]
    server_time: str


class CommitResult(BaseModel):
    """Returned by every mutating endpoint. status='conflict' carries a code."""
    status: Literal["committed", "noop", "conflict", "claimed", "shared", "raised", "resolved", "released"]
    code: Optional[int] = None      # 409, 410, 423, 202
    id: Optional[str] = None
    sequence: Optional[int] = None
    expires_at: Optional[str] = None
    existing: Optional[dict[str, Any]] = None
    attempted: Optional[dict[str, Any]] = None
    required_action: Optional[str] = None
    suggested_question: Optional[str] = None


# ----------------------------------------------------------------------
# WebSocket envelope
# ----------------------------------------------------------------------

class WSEvent(BaseModel):
    event: str
    data: dict[str, Any]
    ts: str = Field(default_factory=now_iso)
