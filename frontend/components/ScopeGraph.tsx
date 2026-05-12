'use client';

import { useCoord } from '@/lib/store';
import type { Decision, Intent, Participant } from '@/lib/types';
import { AgentBadge } from '@/components/AgentBadge';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface ScopeNode {
  scope: string;
  agents: Participant[];
  intents: Intent[];
  decisions: Decision[];
  isLocked: boolean;
}

export function buildScopeTree(
  participants: Participant[],
  intents: Intent[],
  decisions: Decision[],
): ScopeNode[] {
  const nodes = new Map<string, ScopeNode>();

  const ensure = (scope: string) => {
    if (!nodes.has(scope)) {
      nodes.set(scope, {
        scope,
        agents: [],
        intents: [],
        decisions: [],
        isLocked: false,
      });
    }
    return nodes.get(scope)!;
  };

  for (const p of participants) {
    for (const s of p.scope) ensure(s);
  }
  for (const i of intents) ensure(i.scope);
  for (const d of decisions) ensure(d.scope);

  for (const p of participants) {
    for (const s of p.scope) {
      const n = nodes.get(s);
      if (n && !n.agents.some((x) => x.agent_id === p.agent_id)) {
        n.agents.push(p);
      }
    }
  }

  const activeIntents = intents.filter((i) => i.status === 'active');
  for (const i of activeIntents) {
    nodes.get(i.scope)?.intents.push(i);
  }

  for (const d of decisions) {
    const n = nodes.get(d.scope);
    if (n) {
      n.decisions.push(d);
      n.isLocked = true;
    }
  }

  return Array.from(nodes.values()).sort((a, b) => a.scope.localeCompare(b.scope));
}

function scopeDepth(scope: string): number {
  const trimmed = scope.replace(/\/+$/, '');
  if (!trimmed) return 0;
  return Math.max(0, trimmed.split('/').filter(Boolean).length - 1);
}

export function ScopeGraph() {
  const participants = useCoord((s) => s.participants);
  const intents = useCoord((s) => s.intents);
  const decisions = useCoord((s) => s.decisions);

  const rows = useMemo(
    () => buildScopeTree(participants, intents, decisions),
    [participants, intents, decisions],
  );

  const [flashScope, setFlashScope] = useState<string | null>(null);
  const prevIntentIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const next = new Set(intents.filter((i) => i.status === 'active').map((i) => i.id));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    for (const i of intents) {
      if (i.status === 'active' && !prevIntentIds.current.has(i.id)) {
        setFlashScope(i.scope);
        timeout = setTimeout(() => setFlashScope(null), 800);
        break;
      }
    }
    prevIntentIds.current = next;
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [intents]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-2 py-12 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          No scopes claimed yet. Agents will appear here when they register and start working.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-[var(--text)]">Scope graph</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Registered scopes, active intents, and locked decisions.
        </p>
      </div>
      <div className="space-y-0.5">
        {rows.map((node) => {
          const depth = scopeDepth(node.scope);
          const intentAgents = new Map<string, Participant>();
          for (const i of node.intents) {
            const p = participants.find((x) => x.agent_id === i.agent);
            if (p) intentAgents.set(i.agent, p);
          }
          const waitingAgents = [...intentAgents.values()].filter(
            (p) => !node.agents.some((o) => o.agent_id === p.agent_id),
          );
          const hasActiveIntent = node.intents.some((i) => i.status === 'active');
          const decisionCount = node.decisions.length;
          const flashing = flashScope === node.scope;

          return (
            <motion.div
              key={node.scope}
              animate={
                flashing
                  ? { backgroundColor: ['#fef3c7', 'transparent'] }
                  : { backgroundColor: 'transparent' }
              }
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="group flex items-center gap-3 rounded-lg px-4 py-2.5 hover:bg-[var(--surface2)]"
            >
              <div className="shrink-0" style={{ width: depth * 16 }} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-[var(--text)]">
                {node.scope}
              </span>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {node.agents.map((a) => (
                  <AgentBadge key={a.agent_id} agentId={a.agent_id} />
                ))}
                {waitingAgents.map((a) => (
                  <AgentBadge key={`wait-${a.agent_id}-${node.scope}`} agentId={a.agent_id} waiting />
                ))}
                {hasActiveIntent && (
                  <span className="rounded border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    ⚡ active
                  </span>
                )}
                {node.isLocked && (
                  <span className="text-[10px] font-bold text-[var(--decision)]">
                    🔒 {decisionCount}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
