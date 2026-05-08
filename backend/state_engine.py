"""The four consistency models.

Each domain type (Decision, Discovery, Intent, Question) gets its own function
implementing the right consistency story. Generic write paths are deliberately
absent — they would lose the per-type semantics.

Every successful mutation:
  1. updates SQLite under db_lock,
  2. appends an immutable JSONL log entry,
  3. broadcasts a WebSocket event,
  4. (questions only) regenerates inbox.md.

Conflict codes returned to callers:
  409 — Decision conflict (FWW violated)
  410 — Discovery hash mismatch (caller passed a stale hash)
  423 — Intent scope overlap (locked)
  202 — Question accepted but non-blocking (queued)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from . import storage, ws_broadcast
from .config import (
    DEFAULT_INTENT_TTL_MINUTES,
    MAX_ACTIVE_INTENTS_PER_AGENT,
)
from .models import now_iso


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def _gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:8]}"


def _scopes_overlap(a: str, b: str) -> bool:
    """Prefix-aware overlap check.

    `auth/` overlaps `auth/middleware.ts` and vice versa.
    `auth.ts` does NOT overlap `auth_helpers.ts` (must be a path boundary).
    """
    a = a.rstrip("/")
    b = b.rstrip("/")
    if a == b:
        return True
    # Either is a strict path-prefix of the other.
    return (
        a.startswith(b + "/")
        or b.startswith(a + "/")
    )


# ----------------------------------------------------------------------
# DECISION — First-Write-Wins
# ----------------------------------------------------------------------

async def commit_decision(
    scope: str,
    key: str,
    value: str,
    agent: str,
    rationale: str | None = None,
) -> dict[str, Any]:
    """Commit a contract. Existing value with a different value → 409 conflict.

    Returns:
      {"status": "committed", "sequence": int} on first write
      {"status": "noop"}                       on idempotent re-write (same value)
      {"status": "conflict", "code": 409, ...} on different existing value
    """
    async with storage.transaction() as conn:
        cur = await conn.execute(
            "SELECT value, agent FROM decisions WHERE scope = ? AND key = ?",
            (scope, key),
        )
        existing = await cur.fetchone()
        await cur.close()

        if existing is not None:
            if existing["value"] == value:
                return {"status": "noop"}
            return {
                "status": "conflict",
                "code": 409,
                "existing": {
                    "value": existing["value"],
                    "agent": existing["agent"],
                },
                "attempted": {"value": value, "agent": agent},
                "required_action": "raise_question",
                "suggested_question": (
                    f"Decision conflict on `{scope}::{key}`: "
                    f"existing `{existing['value']}` (by {existing['agent']}) "
                    f"vs proposed `{value}` (by {agent}). Which should win?"
                ),
            }

        seq = await storage.next_sequence()
        ts = now_iso()
        await conn.execute(
            "INSERT INTO decisions (scope, key, value, agent, rationale, created_at, sequence) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (scope, key, value, agent, rationale, ts, seq),
        )
        await conn.commit()

    log_entry = {
        "type": "decision_committed",
        "scope": scope, "key": key, "value": value,
        "agent": agent, "rationale": rationale,
        "sequence": seq, "ts": ts,
    }
    await storage.append_log(log_entry)
    await ws_broadcast.publish("decision_committed", {
        "scope": scope, "key": key, "value": value,
        "agent": agent, "rationale": rationale,
        "sequence": seq, "created_at": ts,
    })
    return {"status": "committed", "sequence": seq}


# ----------------------------------------------------------------------
# DISCOVERY — Last-Write-Wins + supersede flag
# ----------------------------------------------------------------------

async def share_discovery(
    scope: str,
    summary: str,
    agent: str,
    file_hash: str | None = None,
    confidence: str = "unverified",
) -> dict[str, Any]:
    """Share an observation. Older non-superseded entries on the same scope
    are flipped to superseded=1 (kept for audit, hidden from default reads).
    """
    discovery_id = _gen_id("disc")
    ts = now_iso()

    async with storage.transaction() as conn:
        # Mark prior active discoveries on this scope as superseded.
        cur = await conn.execute(
            "SELECT id FROM discoveries WHERE scope = ? AND superseded = 0",
            (scope,),
        )
        prior_ids = [row["id"] for row in await cur.fetchall()]
        await cur.close()

        if prior_ids:
            await conn.execute(
                "UPDATE discoveries SET superseded = 1 WHERE scope = ? AND superseded = 0",
                (scope,),
            )

        await conn.execute(
            "INSERT INTO discoveries "
            "(id, scope, summary, file_hash, agent, confidence, created_at, superseded) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
            (discovery_id, scope, summary, file_hash, agent, confidence, ts),
        )
        await conn.commit()

    log_entry = {
        "type": "discovery_shared",
        "id": discovery_id, "scope": scope, "summary": summary,
        "file_hash": file_hash, "agent": agent, "confidence": confidence,
        "superseded_ids": prior_ids, "ts": ts,
    }
    await storage.append_log(log_entry)

    for pid in prior_ids:
        await ws_broadcast.publish("discovery_superseded", {"id": pid, "scope": scope})

    await ws_broadcast.publish("discovery_shared", {
        "id": discovery_id, "scope": scope, "summary": summary,
        "file_hash": file_hash, "agent": agent, "confidence": confidence,
        "created_at": ts, "superseded": False,
    })
    return {"status": "shared", "id": discovery_id}


# ----------------------------------------------------------------------
# INTENT — TTL lease with auto-GC and prefix-aware overlap
# ----------------------------------------------------------------------

async def claim_intent(
    scope: str,
    action: str,
    agent: str,
    ttl_minutes: int = DEFAULT_INTENT_TTL_MINUTES,
) -> dict[str, Any]:
    """Claim a working lease on a scope.

    Returns:
      {"status": "claimed", "id": str, "expires_at": str}    on success
      {"status": "conflict", "code": 423, "existing_lease":..} on overlap
      {"status": "conflict", "code": 429, "active_count":..}   if agent at cap
    """
    # GC first so callers see an honest picture.
    await gc_expired_intents()

    async with storage.transaction() as conn:
        # Per-agent cap.
        cur = await conn.execute(
            "SELECT COUNT(*) AS n FROM intents WHERE agent = ? AND status = 'active'",
            (agent,),
        )
        row = await cur.fetchone()
        await cur.close()
        if row["n"] >= MAX_ACTIVE_INTENTS_PER_AGENT:
            return {
                "status": "conflict",
                "code": 429,
                "active_count": row["n"],
                "max": MAX_ACTIVE_INTENTS_PER_AGENT,
                "required_action": "release_an_intent_first",
            }

        # Overlap check.
        cur = await conn.execute(
            "SELECT id, scope, agent, action, expires_at FROM intents WHERE status = 'active'",
            (),
        )
        active = await cur.fetchall()
        await cur.close()

        for lease in active:
            if lease["agent"] == agent and lease["scope"] == scope:
                # Same agent re-claiming exact scope — refresh TTL.
                new_expiry = (
                    datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
                ).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
                await conn.execute(
                    "UPDATE intents SET expires_at = ? WHERE id = ?",
                    (new_expiry, lease["id"]),
                )
                await conn.commit()
                await ws_broadcast.publish("intent_refreshed", {
                    "id": lease["id"], "scope": scope, "agent": agent,
                    "expires_at": new_expiry,
                })
                return {
                    "status": "claimed",
                    "id": lease["id"],
                    "expires_at": new_expiry,
                    "refreshed": True,
                }
            if _scopes_overlap(lease["scope"], scope):
                return {
                    "status": "conflict",
                    "code": 423,
                    "existing_lease": {
                        "id": lease["id"],
                        "scope": lease["scope"],
                        "agent": lease["agent"],
                        "action": lease["action"],
                        "expires_at": lease["expires_at"],
                    },
                    "required_action": "wait_or_narrow_scope",
                }

        # Clear to claim.
        intent_id = _gen_id("int")
        ts = now_iso()
        expires_at = (
            datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
        ).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        await conn.execute(
            "INSERT INTO intents (id, scope, action, agent, created_at, expires_at, status) "
            "VALUES (?, ?, ?, ?, ?, ?, 'active')",
            (intent_id, scope, action, agent, ts, expires_at),
        )
        await conn.commit()

    await storage.append_log({
        "type": "intent_claimed",
        "id": intent_id, "scope": scope, "action": action,
        "agent": agent, "expires_at": expires_at, "ts": ts,
    })
    await ws_broadcast.publish("intent_claimed", {
        "id": intent_id, "scope": scope, "action": action,
        "agent": agent, "created_at": ts, "expires_at": expires_at,
        "status": "active",
    })
    return {"status": "claimed", "id": intent_id, "expires_at": expires_at}


async def release_intent(intent_id: str, agent: str) -> dict[str, Any]:
    async with storage.transaction() as conn:
        cur = await conn.execute(
            "SELECT id, agent, scope, status FROM intents WHERE id = ?",
            (intent_id,),
        )
        row = await cur.fetchone()
        await cur.close()
        if row is None:
            return {"status": "conflict", "code": 404}
        if row["agent"] != agent:
            return {
                "status": "conflict", "code": 403,
                "required_action": "only_owner_can_release",
            }
        if row["status"] != "active":
            return {"status": "noop"}
        await conn.execute(
            "UPDATE intents SET status = 'released' WHERE id = ?",
            (intent_id,),
        )
        await conn.commit()
        scope = row["scope"]

    ts = now_iso()
    await storage.append_log({
        "type": "intent_released", "id": intent_id, "agent": agent, "ts": ts,
    })
    await ws_broadcast.publish("intent_released", {"id": intent_id, "scope": scope})
    return {"status": "released"}


async def gc_expired_intents() -> int:
    """Mark expired intents as expired. Returns count expired.

    Called on every read_state. Cheap because of the partial index.
    """
    now = now_iso()
    async with storage.transaction() as conn:
        cur = await conn.execute(
            "SELECT id, scope, agent FROM intents "
            "WHERE status = 'active' AND expires_at < ?",
            (now,),
        )
        expired = await cur.fetchall()
        await cur.close()
        if not expired:
            return 0
        await conn.execute(
            "UPDATE intents SET status = 'expired' "
            "WHERE status = 'active' AND expires_at < ?",
            (now,),
        )
        await conn.commit()

    for row in expired:
        await storage.append_log({
            "type": "intent_expired",
            "id": row["id"], "scope": row["scope"], "agent": row["agent"],
            "ts": now,
        })
        await ws_broadcast.publish("intent_expired", {
            "id": row["id"], "scope": row["scope"], "agent": row["agent"],
        })
    return len(expired)


# ----------------------------------------------------------------------
# QUESTION — append + status transitions
# ----------------------------------------------------------------------

async def raise_question(
    scope: str,
    asks: str,
    asker_agent: str,
    target: str = "human",
    blocking: bool = True,
) -> dict[str, Any]:
    qid = _gen_id("q")
    ts = now_iso()
    async with storage.transaction() as conn:
        await conn.execute(
            "INSERT INTO questions "
            "(id, scope, asks, asker_agent, target, blocking, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'open', ?)",
            (qid, scope, asks, asker_agent, target, 1 if blocking else 0, ts),
        )
        await conn.commit()

    await storage.append_log({
        "type": "question_raised",
        "id": qid, "scope": scope, "asks": asks,
        "asker_agent": asker_agent, "target": target, "blocking": blocking,
        "ts": ts,
    })
    await ws_broadcast.publish("question_raised", {
        "id": qid, "scope": scope, "asks": asks,
        "asker_agent": asker_agent, "target": target,
        "blocking": blocking, "status": "open",
        "created_at": ts,
    })
    await _refresh_inbox()
    return {"status": "raised", "id": qid, "code": 202 if not blocking else None}


async def answer_question(
    question_id: str, answer: str, resolved_by: str
) -> dict[str, Any]:
    ts = now_iso()
    async with storage.transaction() as conn:
        cur = await conn.execute(
            "SELECT id, status FROM questions WHERE id = ?", (question_id,)
        )
        row = await cur.fetchone()
        await cur.close()
        if row is None:
            return {"status": "conflict", "code": 404}
        if row["status"] in ("resolved", "deferred"):
            return {"status": "noop", "current_status": row["status"]}

        await conn.execute(
            "UPDATE questions SET answer = ?, resolved_by = ?, "
            "status = 'answered', resolved_at = ? WHERE id = ?",
            (answer, resolved_by, ts, question_id),
        )
        await conn.commit()

    await storage.append_log({
        "type": "question_answered",
        "id": question_id, "answer": answer, "resolved_by": resolved_by, "ts": ts,
    })
    await ws_broadcast.publish("question_answered", {
        "id": question_id, "answer": answer,
        "resolved_by": resolved_by, "resolved_at": ts,
    })
    await _refresh_inbox()
    return {"status": "answered"}


async def resolve_question(
    question_id: str, resolution: str, resolved_by: str
) -> dict[str, Any]:
    """Final close. Distinct from `answer` — answer is "here's the info";
    resolve is "this question is now closed and the system should reflect that."
    """
    ts = now_iso()
    async with storage.transaction() as conn:
        cur = await conn.execute(
            "SELECT id FROM questions WHERE id = ?", (question_id,)
        )
        row = await cur.fetchone()
        await cur.close()
        if row is None:
            return {"status": "conflict", "code": 404}
        await conn.execute(
            "UPDATE questions SET status = 'resolved', "
            "answer = COALESCE(answer, ?), resolved_by = ?, resolved_at = ? "
            "WHERE id = ?",
            (resolution, resolved_by, ts, question_id),
        )
        await conn.commit()

    await storage.append_log({
        "type": "question_resolved",
        "id": question_id, "resolution": resolution,
        "resolved_by": resolved_by, "ts": ts,
    })
    await ws_broadcast.publish("question_resolved", {
        "id": question_id, "resolution": resolution,
        "resolved_by": resolved_by, "resolved_at": ts,
    })
    await _refresh_inbox()
    return {"status": "resolved"}


# ----------------------------------------------------------------------
# Read path
# ----------------------------------------------------------------------

async def get_state(scope_filter: str | None = None) -> dict[str, list[dict]]:
    """Snapshot. Side-effect: GC expired intents."""
    await gc_expired_intents()

    # Build WHERE clause. When filtering by scope we wrap the scope conditions
    # in parentheses so that the AND for status/superseded binds correctly:
    #   WHERE (scope = ? OR scope LIKE ?) AND superseded = 0
    # Without parens, SQL operator precedence gives:
    #   WHERE scope = ? OR (scope LIKE ? AND superseded = 0)   ← bug
    scope_clause = ""
    params: tuple = ()
    if scope_filter:
        scope_clause = "(scope = ? OR scope LIKE ?)"
        params = (scope_filter, f"{scope_filter}/%")

    conn = storage.db()

    decisions_where = f"WHERE {scope_clause}" if scope_clause else ""
    cur = await conn.execute(
        f"SELECT * FROM decisions {decisions_where} ORDER BY sequence ASC", params
    )
    decisions = [dict(r) for r in await cur.fetchall()]
    await cur.close()

    disc_where = (
        f"WHERE {scope_clause} AND superseded = 0" if scope_clause
        else "WHERE superseded = 0"
    )
    cur = await conn.execute(
        f"SELECT * FROM discoveries {disc_where} ORDER BY created_at DESC", params
    )
    discoveries = [dict(r) for r in await cur.fetchall()]
    for d in discoveries:
        d["superseded"] = bool(d["superseded"])
    await cur.close()

    intents_where = (
        f"WHERE {scope_clause} AND status = 'active'" if scope_clause
        else "WHERE status = 'active'"
    )
    cur = await conn.execute(
        f"SELECT * FROM intents {intents_where} ORDER BY created_at DESC", params
    )
    intents = [dict(r) for r in await cur.fetchall()]
    await cur.close()

    questions_where = (
        f"WHERE {scope_clause} AND status IN ('open', 'answered')" if scope_clause
        else "WHERE status IN ('open', 'answered')"
    )
    cur = await conn.execute(
        f"SELECT * FROM questions {questions_where} ORDER BY created_at DESC", params
    )
    questions = [dict(r) for r in await cur.fetchall()]
    # Coerce SQLite 0/1 to bool for clients.
    for q in questions:
        q["blocking"] = bool(q["blocking"])
    await cur.close()

    return {
        "decisions": decisions,
        "discoveries": discoveries,
        "intents": intents,
        "questions": questions,
    }


# ----------------------------------------------------------------------
# Internal: keep inbox.md in sync with the question table
# ----------------------------------------------------------------------

async def _refresh_inbox() -> None:
    state = await get_state()
    await storage.regenerate_inbox(state["questions"])
= [dict(r) for r in await cur.fetchall()]
    # Coerce SQLite 0/1 to bool for clients.
    for q in questions:
        q["blocking"] = bool(q["blocking"])
    await cur.close()

    return {
        "decisions": decisions,
        "discoveries": discoveries,
        "intents": intents,
        "questions": questions,
    }


# ----------------------------------------------------------------------
# Internal: keep inbox.md in sync with the question table
# ----------------------------------------------------------------------

async def _refresh_inbox() -> None:
    state = await get_state()
    await storage.regenerate_inbox(state["questions"])
