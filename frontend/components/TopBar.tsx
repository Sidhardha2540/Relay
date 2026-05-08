'use client';

import { useCoord } from '@/lib/store';
import { Activity, Wifi, WifiOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';

const AGENT_COLORS: Record<string, string> = {
  'claude-code': 'bg-amber-400',
  cursor: 'bg-cursor',
  aider: 'bg-aider',
  human: 'bg-question',
};

export function TopBar({ connected, demoMode }: { connected: boolean; demoMode: boolean }) {
  const intents = useCoord((s) => s.intents.length);
  const questions = useCoord((s) =>
    s.questions.filter((q) => q.status === 'open' || q.status === 'answered').length
  );
  const feed = useCoord((s) => s.feed);
  const replayDemo = useCoord((s) => s.replayDemo);
  const [replaying, setReplaying] = useState(false);
  const now = Date.now();

  const agentPresence = useMemo(() => {
    const byAgent = new Map<string, number>();
    for (const item of feed) {
      if (!item.agent) continue;
      const ts = new Date(item.ts).getTime();
      const prev = byAgent.get(item.agent);
      if (!prev || ts > prev) byAgent.set(item.agent, ts);
    }
    return Array.from(byAgent.entries()).map(([agent, ts]) => ({
      agent,
      active: now - ts < 60_000,
    }));
  }, [feed, now]);

  const onReplay = async () => {
    setReplaying(true);
    try {
      await replayDemo();
    } finally {
      setReplaying(false);
    }
  };

  return (
    <header className="h-12 border-b border-border bg-surface flex items-center px-4 gap-6">
      <div className="flex items-center gap-2 font-mono text-sm">
        <span className="font-semibold tracking-wide">Coord</span>
        <span className="text-muted">— agent coordination</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-4 text-xs text-muted">
        {agentPresence.length > 0 && (
          <span className="flex items-center gap-1.5">
            {agentPresence.map((presence) => (
              <motion.span
                key={presence.agent}
                className={`w-2.5 h-2.5 rounded-full ${AGENT_COLORS[presence.agent] || 'bg-muted'}`}
                style={{ opacity: presence.active ? 1 : 0.3 }}
                animate={presence.active ? { opacity: [1, 0.7, 1] } : undefined}
                transition={presence.active ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : undefined}
                title={presence.agent}
              />
            ))}
          </span>
        )}
        {demoMode && (
          <span className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded border border-cursor/40 text-cursor font-mono">Demo mode</span>
            <button
              onClick={onReplay}
              disabled={replaying}
              className="px-2 py-1 rounded border border-border hover:border-muted/60 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {replaying ? 'Replaying…' : 'Replay'}
            </button>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-intent" />
          {intents} active intent{intents === 1 ? '' : 's'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-question" />
          {questions} open question{questions === 1 ? '' : 's'}
        </span>
        <span
          className={`flex items-center gap-1.5 ${
            connected ? 'text-aider' : 'text-question'
          }`}
        >
          {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {connected ? 'live' : 'reconnecting'}
        </span>
      </div>
    </header>
  );
}
