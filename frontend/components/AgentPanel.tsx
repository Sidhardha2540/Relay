'use client';

import { useCoord } from '@/lib/store';
import type { Intent, Participant } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { TTLCountdown } from '@/components/TTLCountdown';

function statusOrder(s: Participant['status']): number {
  if (s === 'online') return 0;
  if (s === 'idle') return 1;
  return 2;
}

function AgentCard({
  agent,
  activeIntent,
}: {
  agent: Participant;
  activeIntent: Intent | undefined;
}) {
  const statusDot =
    agent.status === 'online'
      ? 'bg-[var(--online)]'
      : agent.status === 'idle'
        ? 'bg-[var(--idle)]'
        : 'bg-[var(--offline)]';

  const statusLabel =
    agent.status === 'online'
      ? 'Online'
      : agent.status === 'idle'
        ? 'Idle'
        : 'Offline';

  return (
    <div
      className={`space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 ${agent.status === 'offline' ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
          <span className="truncate text-sm font-semibold text-[var(--text)]">
            {agent.agent_id}
          </span>
          {agent.role_tag && (
            <span className="shrink-0 rounded border border-[var(--border)] px-1 text-[10px] text-[var(--text-muted)]">
              {agent.role_tag}
            </span>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{statusLabel}</span>
      </div>

      <p className="line-clamp-2 text-xs leading-snug text-[var(--text-muted)]">{agent.task}</p>

      {activeIntent && (
        <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 dark:border-amber-800 dark:bg-amber-950/20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Working on
            </span>
            <TTLCountdown expiresAt={activeIntent.expires_at} />
          </div>
          <p className="truncate font-mono text-xs text-amber-800 dark:text-amber-200">
            {activeIntent.scope}
          </p>
          <p className="truncate text-[11px] text-amber-600 dark:text-amber-400">
            {activeIntent.action}
          </p>
        </div>
      )}

      {agent.status !== 'online' && agent.last_seen && (
        <p className="text-[10px] text-[var(--text-muted)]">
          Last seen {timeAgo(agent.last_seen)}
        </p>
      )}
    </div>
  );
}

export function AgentPanel() {
  const participants = useCoord((s) => s.participants);
  const intents = useCoord((s) => s.intents.filter((i) => i.status === 'active'));

  const sorted = [...participants].sort((a, b) => {
    const d = statusOrder(a.status) - statusOrder(b.status);
    if (d !== 0) return d;
    return a.agent_id.localeCompare(b.agent_id);
  });

  const intentByAgent = new Map<string, Intent>();
  for (const i of intents) {
    if (!intentByAgent.has(i.agent)) intentByAgent.set(i.agent, i);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-0.5">
        <h2 className="text-sm font-bold text-[var(--text)]">Agents</h2>
        <span className="text-xs text-[var(--text-muted)]">{participants.length}</span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-2 py-12 text-center">
          <p className="text-sm text-[var(--text-muted)]">No agents registered</p>
          <code className="max-w-full rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-2 py-2 text-[10px] text-[var(--text)]">
            POST /api/register
          </code>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((p) => (
            <AgentCard
              key={p.agent_id}
              agent={p}
              activeIntent={intentByAgent.get(p.agent_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
