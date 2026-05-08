# Architecture

## Design Principles (Non-Negotiable)

1. **Mechanical enforcement, not prompt rules.** Every consistency guarantee is enforced by the daemon. Prompts cannot make agents "remember to check inbox.md" — under context pressure they will forget. The protocol must be the enforcement.
2. **Explicit consistency per type.** No collapsed model. Decisions, Discoveries, Intents, and Questions each get a model that fits their semantics. A 409 on a Discovery would be wrong; an LWW Decision would be catastrophic.
3. **Single writer.** Only the daemon writes to disk. SQLite WAL mode + `asyncio.Lock` serialize all mutations within the daemon process. No two-process file races.
4. **Atomic durability.** State writes are SQLite transactions. Audit log entries are JSONL with `fsync` after every append (small entries < 4KB are atomic on POSIX).
5. **Identity is implicit.** Agent ID is set in the MCP shim's environment. Tool calls cannot lie about who they are.
6. **Graceful degradation.** If an agent bypasses the shim and writes directly, the daemon detects checksum mismatches on read and logs the violation. The system stays consistent; the offender is visible.
7. **N>2 from day one.** Deterministic tiebreaking (sequence > timestamp > agent ID alphabetical). Per-agent intent caps. Scope cooldowns to prevent thrash.

## The Four Consistency Models

### Decision — First-Write-Wins (FWW)

**Why FWW:** Decisions are contracts. If Agent A commits `auth.token.name = "verifyJWT"` and Agent B writes code that calls `verifyJWT()`, then later Agent C says "actually, `validateToken`" and overwrites — Agent B's code silently breaks. Decisions must be **stable** until explicitly revisited.

**Conflict path:** Second writer gets `409` with both values + `required_action: "raise_question"`. The conflict surfaces in the human inbox.

**Tiebreaker for simultaneous writes:** monotonic `sequence` counter from SQLite. Whichever transaction commits first wins.

### Discovery — Last-Write-Wins + Hash Invalidation

**Why LWW:** Discoveries are *observations* about the codebase ("`auth/middleware.ts` exports `verifyJWT` at line 14"). The world changes — the file gets edited. Stale discoveries actively mislead. LWW with file-hash invalidation guarantees the freshest fact wins.

**Stale detection:** Every discovery records `file_hash`. On `read_state`, the daemon checks current hashes; mismatched discoveries are flagged `stale` (not deleted — kept for audit).

**Supersede:** New discovery on the same scope flips prior entries' `superseded=1`. Reads default to non-superseded. Dashboard shows superseded ones greyed out.

### Intent — TTL Lease

**Why leases:** "I'm refactoring `auth/middleware.ts`" is useful for ~10 minutes. After that, the agent has either finished, crashed, or moved on. A lease forces eventual release without manual cleanup.

**Auto-GC:** Every `read_state` call runs `gc_expired_intents()`. Expired intents flip to `expired` status and broadcast a WebSocket event. Cheap, predictable.

**Overlap:** Scopes are file/directory paths. Prefix-aware overlap (`auth/` overlaps `auth/middleware.ts`). Conflicting claim returns `423` with the existing lease's expiry.

**Per-agent cap:** Default 3 active intents per agent. Prevents an agent from claiming the entire repo and starving others.

### Question — Append + Status Transitions

**Why append-only:** Questions are conversations. A blocking question that resolved at 14:02 is part of the audit trail forever. State machine: `open → answered → resolved | deferred`.

**Inbox materialization:** On every question event, the daemon regenerates `.shared/inbox.md` — a human-readable mirror sorted by priority (blocking first, then by age). The developer can read this in their editor without opening the dashboard.

## Conflict Codes

| Code | Meaning                              | Agent Reaction                              |
| ---- | ------------------------------------ | ------------------------------------------- |
| 409  | Decision conflict (FWW violated)     | Read existing, raise question, do not retry |
| 410  | Discovery file hash mismatch         | Discard, re-read file                       |
| 423  | Intent scope overlap                 | Wait for TTL, or claim a narrower scope     |
| 202  | Question queued (non-blocking)       | Continue work                               |

These codes mirror HTTP semantics deliberately — agents already know how to react to 4xx without prompt instructions.

## Atomic Write Pattern

**SQLite:** Every mutation is a transaction. WAL mode allows concurrent reads while writes are serialized by `asyncio.Lock`.

**JSONL audit log:**

```python
async with file_lock:
    line = json.dumps(entry) + "\n"          # < 4KB → atomic on POSIX
    async with aiofiles.open(LOG_PATH, "a") as f:
        await f.write(line)
        await f.flush()
        os.fsync(f.fileno())                 # durable across crash
```

**Why not just SQLite for the log?** JSONL is greppable, tailable (`tail -f .shared/log.jsonl`), and survives database corruption. Belt and suspenders.

## Why a Daemon, Not a File-Based Protocol

A naive design would have agents read/write `.shared/state.json` directly. That fails because:

- **Race conditions.** Two agents reading-modifying-writing simultaneously corrupt the file.
- **No event stream.** The dashboard would have to poll. Polling at 100ms still misses sub-100ms changes.
- **No enforcement point.** Each agent is on the honor system to validate, lock, retry. Prompt rules are not enforcement.
- **Cross-process locks are unreliable.** `flock` works on Linux, sort-of on macOS, badly on Windows. Network drives break it entirely.

A localhost daemon dodges all of this. One process, one lock, one event source.

## Why Per-Agent MCP Shims (Not One Shared MCP Server)

MCP is stdio-based. A single MCP server can only serve one client at a time. To serve N agents simultaneously, we'd need to invent a multiplexer.

Instead: each agent's IDE config spawns its own shim subprocess. The shim is a tiny stdio MCP server that proxies tool calls to the daemon's HTTP API. Identity is set in the shim's environment (`COORD_AGENT_ID=claude-code`). The daemon sees clean HTTP requests with identity in a header.

This also means non-MCP clients can participate by hitting the HTTP API directly (curl, scripts, future agents).

## Scaling Past N=2

The architecture handles N>2 with no changes:

- **Deterministic ordering:** sequence counter > server timestamp > agent ID alphabetical. No coin flips.
- **Scope partitioning:** non-overlapping scopes claim freely. Overlapping scopes hit 423 and negotiate.
- **Auto-consensus on questions:** if 2+ agents independently raise the same question (same scope + same `asks` text), the daemon flags it `auto-resolvable` in the inbox. Reduces noise.
- **Priority queue:** questions sorted by `blocking` flag, then scope impact (cross-module > single file), then age.

## Offline Developer Mode

Agents keep working while the developer is away. Questions accumulate. Stale intents GC. On return, the dashboard shows a digest:

> You were away 2h 17m.
> 4 questions auto-resolved (consensus).
> 2 need your review.
> 1 deferred (waiting on external API decision).

Implementation: dashboard tracks `last_seen` in localStorage. On reconnect, queries `/api/digest?since=<timestamp>`.

## What This Architecture Does NOT Do

- **No git integration.** Coord is orthogonal to source control. Agents commit their own changes. Coord is about coordination, not code.
- **No agent lifecycle management.** Coord doesn't spawn or kill agents. The IDE does.
- **No code analysis.** Coord doesn't parse the codebase. Discoveries are whatever the agent shares; they're trusted as the agent's perception.
- **No remote/distributed mode.** Localhost only. Multi-machine is a different problem.

These are deliberate scope cuts. Each one would 10x the surface area for marginal value at this stage.
