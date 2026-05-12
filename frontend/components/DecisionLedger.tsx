'use client';

import { useCoord } from '@/lib/store';
import { AgentBadge } from '@/components/AgentBadge';
import { timeAgo } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';

export function DecisionLedger() {
  const decisions = useCoord((s) => s.decisions);

  const sorted = useMemo(
    () => [...decisions].sort((a, b) => b.sequence - a.sequence),
    [decisions],
  );

  return (
    <div className="flex h-full min-h-0 flex-col space-y-3">
      <div>
        <h2 className="text-sm font-bold text-[var(--text)]">Locked decisions</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          First-Write-Wins — immutable once committed.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 z-[1] bg-[var(--surface)]">
            <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              <th className="pb-2 pl-4 pt-3 text-left">Scope</th>
              <th className="pb-2 pt-3 text-left">Key</th>
              <th className="pb-2 pt-3 text-left">Value</th>
              <th className="pb-2 pt-3 text-left">By</th>
              <th className="pb-2 pr-4 pt-3 text-right">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            <AnimatePresence initial={false}>
              {sorted.map((d) => (
                <motion.tr
                  key={`${d.scope}-${d.key}-${d.sequence}`}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="hover:bg-[var(--surface2)]"
                >
                  <td className="max-w-[140px] truncate py-2 pl-4 font-mono text-xs text-[var(--text-muted)]">
                    {d.scope}
                  </td>
                  <td className="max-w-[120px] truncate py-2 font-mono text-xs font-semibold text-[var(--text)]">
                    {d.key}
                  </td>
                  <td className="py-2">
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-xs text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                      {d.value}
                    </span>
                  </td>
                  <td className="py-2">
                    <AgentBadge agentId={String(d.agent)} small />
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right text-xs text-[var(--text-muted)]">
                    {timeAgo(d.created_at)}
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">No decisions committed yet.</p>
      )}
    </div>
  );
}
