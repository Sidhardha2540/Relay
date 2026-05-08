/**
 * WebSocket client with exponential backoff reconnect.
 *
 * Mount once at the app root (see app/page.tsx). On every event the daemon
 * sends, we feed it into the Zustand store. Reconnect always re-fetches
 * a fresh state_snapshot, so missed messages don't matter.
 */
import { useEffect } from 'react';
import { useCoord } from './store';
import type { WSEnvelope } from './types';

const WS_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_COORD_WS) ||
  'ws://127.0.0.1:49152/ws';

export function useCoordSocket() {
  const applyEvent = useCoord((s) => s.applyEvent);
  const setConnected = useCoord((s) => s.setConnected);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let attempt = 0;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };

      ws.onmessage = (msg) => {
        try {
          const env: WSEnvelope = JSON.parse(msg.data);
          applyEvent(env);
        } catch (err) {
          // Bad message — ignore; daemon will resync on reconnect.
          console.warn('coord: bad ws message', err);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        const delay = Math.min(1000 * 2 ** attempt, 15_000);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // Let onclose handle reconnect.
        ws?.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [applyEvent, setConnected]);
}
