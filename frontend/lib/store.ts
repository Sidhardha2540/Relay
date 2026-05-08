/**
 * Single source of truth on the client. Zustand store fed exclusively by
 * the WebSocket. The dashboard never POSTs (except for human inbox actions).
 *
 * Reducer style: each WSEvent has a handler that mutates state immutably.
 * Keep handlers small — derived UI lives in components.
 */
import { create } from 'zustand';
import type {
  Decision,
  Discovery,
  Intent,
  Question,
  WSEnvelope,
  FeedItem,
} from './types';

const FEED_CAP = 200; // keep the timeline bounded

interface CoordState {
  // Wire status
  connected: boolean;
  serverTime: string | null;
  setConnected: (v: boolean) => void;

  // Stores
  decisions: Decision[];
  discoveries: Discovery[];
  intents: Intent[];
  questions: Question[];
  feed: FeedItem[];

  // Apply a single envelope to the store.
  applyEvent: (env: WSEnvelope) => void;

  // Triage actions (HTTP)
  answerQuestion: (id: string, answer: string) => Promise<void>;
  resolveQuestion: (id: string, resolution: string) => Promise<void>;
  replayDemo: () => Promise<void>;
}

const COORD_HTTP =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_COORD_HTTP) ||
  'http://127.0.0.1:49152';

async function postHuman(path: string, body: unknown) {
  const res = await fetch(`${COORD_HTTP}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Coord-Agent-Id': 'human',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function toFeedItem(env: WSEnvelope): FeedItem | null {
  const ts = env.ts;
  switch (env.event) {
    case 'decision_committed':
      return {
        id: `dec-${env.data.scope}-${env.data.key}-${env.data.sequence}`,
        kind: 'decision',
        agent: env.data.agent,
        scope: env.data.scope,
        summary: `${env.data.key} = ${env.data.value}`,
        ts,
      };
    case 'discovery_shared':
      return {
        id: env.data.id,
        kind: 'discovery',
        agent: env.data.agent,
        scope: env.data.scope,
        summary: env.data.summary,
        ts,
      };
    case 'intent_claimed':
      return {
        id: env.data.id,
        kind: 'intent',
        agent: env.data.agent,
        scope: env.data.scope,
        summary: `claimed: ${env.data.action}`,
        ts,
        meta: { expires_at: env.data.expires_at },
      };
    case 'intent_expired':
      return {
        id: `exp-${env.data.id}`,
        kind: 'intent',
        agent: env.data.agent,
        scope: env.data.scope,
        summary: `expired`,
        ts,
      };
    case 'intent_released':
      return {
        id: `rel-${env.data.id}`,
        kind: 'intent',
        agent: null,
        scope: env.data.scope,
        summary: `released`,
        ts,
      };
    case 'question_raised':
      return {
        id: env.data.id,
        kind: 'question',
        agent: env.data.asker_agent,
        scope: env.data.scope,
        summary: env.data.asks,
        ts,
      };
    case 'question_answered':
    case 'question_resolved':
      return {
        id: `${env.event}-${env.data.id}`,
        kind: 'question',
        agent: env.data.resolved_by,
        scope: '',
        summary:
          env.event === 'question_answered'
            ? `answered: ${env.data.answer}`
            : `resolved: ${env.data.resolution}`,
        ts,
      };
    default:
      return null;
  }
}

export const useCoord = create<CoordState>((set, get) => ({
  connected: false,
  serverTime: null,
  decisions: [],
  discoveries: [],
  intents: [],
  questions: [],
  feed: [],

  setConnected: (connected) => set({ connected }),

  applyEvent: (env) =>
    set((s) => {
      // Always push to feed (except snapshot, which IS the feed reset).
      let nextFeed = s.feed;
      if (env.event !== 'state_snapshot') {
        const item = toFeedItem(env);
        if (item) nextFeed = [item, ...s.feed].slice(0, FEED_CAP);
      }

      switch (env.event) {
        case 'state_snapshot':
          return {
            decisions: env.data.decisions,
            discoveries: env.data.discoveries,
            intents: env.data.intents,
            questions: env.data.questions,
            feed: [], // start fresh on snapshot
            serverTime: env.data.server_time,
          };

        case 'decision_committed':
          return {
            decisions: [...s.decisions, env.data].sort((a, b) => a.sequence - b.sequence),
            feed: nextFeed,
          };

        case 'discovery_shared':
          // New discovery supersedes prior on same scope (server already
          // sends us 'discovery_superseded' events too, but be defensive).
          return {
            discoveries: [
              env.data,
              ...s.discoveries.map((d) =>
                d.scope === env.data.scope && !d.superseded
                  ? { ...d, superseded: true }
                  : d
              ),
            ],
            feed: nextFeed,
          };

        case 'discovery_superseded':
          return {
            discoveries: s.discoveries.map((d) =>
              d.id === env.data.id ? { ...d, superseded: true } : d
            ),
            feed: nextFeed,
          };

        case 'intent_claimed':
          return { intents: [env.data, ...s.intents], feed: nextFeed };

        case 'intent_refreshed':
          return {
            intents: s.intents.map((i) =>
              i.id === env.data.id ? { ...i, expires_at: env.data.expires_at } : i
            ),
            feed: nextFeed,
          };

        case 'intent_expired':
        case 'intent_released':
          return {
            intents: s.intents.filter((i) => i.id !== env.data.id),
            feed: nextFeed,
          };

        case 'question_raised':
          return { questions: [env.data, ...s.questions], feed: nextFeed };

        case 'question_answered':
          return {
            questions: s.questions.map((q) =>
              q.id === env.data.id
                ? { ...q, status: 'answered', answer: env.data.answer,
                    resolved_by: env.data.resolved_by,
                    resolved_at: env.data.resolved_at }
                : q
            ),
            feed: nextFeed,
          };

        case 'question_resolved':
          return {
            questions: s.questions.map((q) =>
              q.id === env.data.id
                ? { ...q, status: 'resolved', resolved_by: env.data.resolved_by,
                    resolved_at: env.data.resolved_at }
                : q
            ),
            feed: nextFeed,
          };

        default:
          return { feed: nextFeed };
      }
    }),

  answerQuestion: async (id, answer) => {
    await postHuman(`/api/questions/${id}/answer`, { answer });
  },
  resolveQuestion: async (id, resolution) => {
    await postHuman(`/api/questions/${id}/resolve`, { resolution });
  },
  replayDemo: async () => {
    await postHuman('/api/_demo/replay', {});
  },
}));
