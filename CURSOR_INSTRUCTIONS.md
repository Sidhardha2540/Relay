# Cursor Build Brief — Coord

You are picking up an architectural base. Read this file end-to-end before writing code.

## What's already done

- **Backend daemon** (Python 3.11 / FastAPI) — fully implemented:
  - `backend/state_engine.py` — all four consistency models (FWW, LWW+supersede, TTL lease, append+status). **Do not modify the consistency rules.**
  - `backend/storage.py` — SQLite WAL + JSONL `fsync` audit log, single `db_lock`.
  - `backend/main.py` — REST endpoints + `/ws`. Agent identity via `X-Coord-Agent-Id` header.
  - `backend/ws_broadcast.py` — connection manager, `publish(event, data)`.
  - `backend/schema.sql` — applied on startup.
- **MCP shim** (`mcp-shim/shim.py`) — stdio MCP server that proxies to the daemon. One process per agent.
- **Frontend skeleton** (`frontend/`) — Next.js 14 App Router, Tailwind, Zustand store, WebSocket client, three-panel layout, all components in working but unpolished state.
- **Demo seed** (`demo/seed_demo.py`) — baseline + a narrated 60s conflict sequence.
- **MCP config examples** (`demo/*_mcp_config.example.json`).

The system is **functionally complete**. It boots, accepts connections, holds state, broadcasts events.

## What you need to do

In priority order:

### 1. Get it running end-to-end (30 min)

```bash
# Terminal 1
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m backend.main          # daemon on :49152

# Terminal 2
cd frontend
npm install
npm run dev                     # dashboard on :3000

# Terminal 3
python demo/seed_demo.py --live # narrate the conflict
```

Expected: dashboard shows three panels, baseline state appears, conflict animation runs.

If something doesn't import: check that you're running the daemon as `python -m backend.main` (not `python backend/main.py`) so relative imports resolve.

### 2. Polish animations with Framer Motion (1-2 hours)

The skeletons use a CSS keyframe (`animate-slideIn`) as a placeholder. Replace with Framer Motion in:

- `components/StatePanel.tsx` — wrap each card list in `<AnimatePresence mode="popLayout">`. Each card: `initial={{ x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}`.
- `components/ActivityFeed.tsx` — same pattern for new feed rows. Auto-scroll to top on new event **only if** the user is already near the top (track scroll position).
- `components/InboxPanel.tsx` — animate `QuestionCard` insertions. The `animate-pulseRed` on blocking cards should remain (it's the visual emergency signal).

All animations under 300ms, `easeOut`. No bounce. No spring overshoot.

### 3. Conflict-card UX in the inbox (1 hour)

When a question's `asks` text starts with `Decision conflict on`, switch the textarea for **two preset buttons** ("Pick `<value-A>`" / "Pick `<value-B>`") plus a "Custom…" toggle. Parse the values out of the suggested-question text — the format is stable (`existing \`X\` ... vs proposed \`Y\``).

Hitting a preset button calls `resolveQuestion(id, "Use <chosen-value>")` directly. This is the demo's hero moment.

### 4. Top-bar agent presence dots (30 min)

Add to `TopBar.tsx`: small colored dots for each agent that has been active in the last 60s (any event with that `agent` field). Idle agents fade to 30% opacity. Active agents pulse subtly (Framer Motion `animate={{ opacity: [1, 0.7, 1] }}` with `repeat: Infinity`).

The store already has `feed`; derive recent agents from it: `feed.filter(f => Date.now() - new Date(f.ts).getTime() < 60_000).map(f => f.agent)` deduped.

### 5. Demo polish (1 hour)

- Make the `seed_demo.py` output prettier — colorize agent names in terminal output to match dashboard colors.
- Add a "Demo mode" indicator in the top bar that appears when `?demo=1` is in the URL, rendering a small "Replay" button that calls `seed_demo.py` via a new daemon endpoint (you'll need to add `POST /api/_demo/replay` that shells out to the script — gate behind an env var so prod can't trigger it).

## Hard rules — do not break these

1. **Do not touch consistency semantics.** Decisions are FWW; conflicts return 409. Discoveries are LWW with supersede flags. Intents are TTL leases with prefix-aware overlap. Questions are append-only with status transitions. The whole pitch falls apart if these are wrong.
2. **The daemon is the only writer.** The dashboard never POSTs except for human inbox actions (`answer`/`resolve`). Agents never write to disk; they go through the MCP shim.
3. **`X-Coord-Agent-Id` is required for all mutations.** The dashboard sends `human`. The shim sends from env. Don't add a way to bypass it.
4. **No localStorage hacks for state.** The Zustand store is fed from WebSocket exclusively. localStorage is fine for UI prefs (which panel is open) but never for domain data.
5. **Event names are a contract.** `backend/ws_broadcast.publish(...)` event names must match the strings in `frontend/lib/types.ts WSEvent`. If you add an event, add it both places in the same commit.
6. **Don't add `flock`, file watchers, or "fallback to direct file IO".** It was considered and rejected — see `ARCHITECTURE.md`. Single writer is the whole point.

## Useful reference

- `README.md` — pitch + quick start.
- `ARCHITECTURE.md` — why each design choice. Read this if you find yourself wanting to "simplify" a consistency model.
- The state engine has comments explaining each conflict code (`409`, `410`, `423`, `429`). Match them in any new code.

## Verification before you call it done

- [ ] `python -m backend.main` starts cleanly, no warnings.
- [ ] `npm run typecheck` in `frontend/` is green.
- [ ] `python demo/seed_demo.py --live` produces visible motion in all three panels.
- [ ] Killing the daemon mid-run, then restarting, recovers state from `.shared/state.db` (intent claims persist; expired ones GC on next read).
- [ ] Dashboard reconnects automatically after daemon restart (within ~2s, with exponential backoff).
- [ ] Two agents claiming the same scope: second sees a 423 in the dashboard's activity feed.
- [ ] Conflicting decisions: second commit produces a 409, the suggested question appears in the inbox, you can resolve it with a preset button.

## What's explicitly out of scope

- Multi-machine / network coordination. Localhost only.
- Auth / agent verification beyond environment-set IDs. This is a local dev tool.
- Git integration. Coord is orthogonal to source control.
- Code parsing or static analysis. Discoveries are whatever agents share; trust them.
- Mobile. Desktop-only dashboard.

If you find yourself wanting to add any of the above, write it down as a future-work note and move on.

## Build sequence (suggested)

1. Get it running (Section 1).
2. Verify with `seed_demo.py --live` that all event types flow.
3. Add Framer Motion polish (Section 2). Watch the demo again — should feel deliberately calm, not bouncy.
4. Conflict-card UX (Section 3). Re-run the demo. The hero moment should now be clickable.
5. Agent presence dots (Section 4).
6. Polish + verify the checklist above.

Total time: ~5-7 focused hours.
