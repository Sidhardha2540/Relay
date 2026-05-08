'use client';

import { useCoord } from '@/lib/store';
import { AgentBadge } from './AgentBadge';
import { timeUntil, timeAgo } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { Clock, FileSearch, GitCommit } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Left panel: current shared state.
 *
 * Three sections — Active Intents (with TTL countdown), Recent Decisions,
 * Recent Discoveries. Each item is keyed so React can animate insertions
 * in the parent grid.
 *
 * Cursor TODO: hook up Framer Motion `<AnimatePresence>` for slide-in on
 * new items. Keep transitions <300ms.
 */
export function StatePanel() {
  const intents     = useCoord((s) => s.intents);
  const decisions   = useCoord((s) => s.decisions);
  const discoveries = useCoord((s) => s.discoveries.filter((d) => !d.superseded));

  // Tick once a second so TTLs visibly count down.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SectionHeader icon={<Clock className="w-3.5 h-3.5 text-intent" />} title="Active intents" count={intents.length} />
      <div className="px-3 pb-3 space-y-1.5 overflow-y-auto" style={{ maxHeight: '33%' }}>
        {intents.length === 0 && <Empty>No active intents.</Empty>}
        <AnimatePresence mode="popLayout">
        {intents.map((i) => (
          <motion.div
            key={i.id}
            initial={{ x: -16, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            layout
            className="border border-border rounded-md p-2 bg-surface"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-intent truncate">{i.scope}</span>
              <span className="font-mono text-[10px] text-muted shrink-0">
                {timeUntil(i.expires_at)}
              </span>
            </div>
            <div className="text-xs mt-1 text-text/80 line-clamp-2">{i.action}</div>
            <div className="mt-1.5"><AgentBadge agent={i.agent} /></div>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>

      <SectionHeader icon={<GitCommit className="w-3.5 h-3.5 text-decision" />} title="Decisions" count={decisions.length} />
      <div className="px-3 pb-3 space-y-1.5 overflow-y-auto" style={{ maxHeight: '33%' }}>
        {decisions.length === 0 && <Empty>No decisions yet.</Empty>}
        <AnimatePresence mode="popLayout">
        {decisions.map((d) => (
          <motion.div
            key={`${d.scope}::${d.key}`}
            initial={{ x: -16, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            layout
            className="border border-border rounded-md p-2 bg-surface"
          >
            <div className="font-mono text-xs text-decision truncate">{d.scope}</div>
            <div className="text-xs mt-1">
              <span className="text-muted">{d.key}</span>
              <span className="text-muted mx-1">=</span>
              <span className="text-text">{d.value}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <AgentBadge agent={d.agent} />
              <span className="text-[10px] text-muted font-mono">#{d.sequence}</span>
            </div>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>

      <SectionHeader icon={<FileSearch className="w-3.5 h-3.5 text-discovery" />} title="Discoveries" count={discoveries.length} />
      <div className="px-3 pb-3 space-y-1.5 overflow-y-auto flex-1">
        {discoveries.length === 0 && <Empty>No discoveries yet.</Empty>}
        <AnimatePresence mode="popLayout">
        {discoveries.map((d) => (
          <motion.div
            key={d.id}
            initial={{ x: -16, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            layout
            className="border border-border rounded-md p-2 bg-surface"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-discovery truncate">{d.scope}</span>
              <ConfidenceBadge confidence={d.confidence} />
            </div>
            <div className="text-xs mt-1 text-text/80 line-clamp-3">{d.summary}</div>
            <div className="mt-1.5 flex items-center justify-between">
              <AgentBadge agent={d.agent} />
              <span className="text-[10px] text-muted font-mono">{timeAgo(d.created_at)}</span>
            </div>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <div className="px-3 py-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted border-b border-border">
      {icon}
      <span>{title}</span>
      <span className="ml-auto font-mono text-[10px]">{count}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted/70 italic py-1">{children}</div>;
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles =
    confidence === 'verified'      ? 'text-aider border-aider/40' :
    confidence === 'contradicted'  ? 'text-question border-question/40' :
                                     'text-muted border-border';
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${styles}`}>
      {confidence}
    </span>
  );
}
