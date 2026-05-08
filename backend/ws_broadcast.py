"""WebSocket connection manager.

The dashboard subscribes once. On connect it receives a `state_snapshot` event
with the full current state, then a live stream of mutation events.

Backpressure strategy: if a send fails, drop the client. Clients reconnect
with fresh state — no need for queueing.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import WebSocket

from .models import now_iso


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(ws)

    async def send_to(self, ws: WebSocket, event: str, data: dict[str, Any]) -> None:
        payload = {"event": event, "data": data, "ts": now_iso()}
        await ws.send_text(json.dumps(payload))

    async def broadcast(self, event: str, data: dict[str, Any]) -> None:
        payload = {"event": event, "data": data, "ts": now_iso()}
        msg = json.dumps(payload)

        async with self._lock:
            targets = list(self._connections)

        # Send concurrently. Drop clients that fail.
        results = await asyncio.gather(
            *[ws.send_text(msg) for ws in targets],
            return_exceptions=True,
        )
        dead: list[WebSocket] = []
        for ws, res in zip(targets, results):
            if isinstance(res, Exception):
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._connections.discard(ws)

    @property
    def count(self) -> int:
        return len(self._connections)


# Module-level singleton. Imported by state_engine for `publish`.
manager = ConnectionManager()


async def publish(event: str, data: dict[str, Any]) -> None:
    """Convenience wrapper used throughout state_engine."""
    await manager.broadcast(event, data)
