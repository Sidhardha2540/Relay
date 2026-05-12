'use client';

import { cn } from '@/lib/utils';

const DOT_PALETTE = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-fuchsia-500',
  'bg-cyan-500',
];

function dotFor(agentId: string): string {
  let h = 0;
  for (let i = 0; i < agentId.length; i++) {
    h = agentId.charCodeAt(i) + ((h << 5) - h);
  }
  return DOT_PALETTE[Math.abs(h) % DOT_PALETTE.length];
}

export function AgentBadge({
  agentId,
  small,
  waiting,
}: {
  agentId: string;
  small?: boolean;
  waiting?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 font-medium text-[var(--text)]',
        small ? 'py-0 text-[10px]' : 'py-0.5 text-xs',
        waiting && 'opacity-70',
      )}
      title={agentId}
    >
      {waiting && <span className="shrink-0 text-[10px]">⏳</span>}
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotFor(agentId))} />
      <span className="truncate">{agentId}</span>
    </span>
  );
}
