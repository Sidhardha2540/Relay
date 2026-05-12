'use client';

import { cn } from '@/lib/utils';

type PillColor = 'slate' | 'amber' | 'rose';

const colorClass: Record<PillColor, string> = {
  slate:
    'bg-[var(--surface2)] text-[var(--text-muted)] border-[var(--border)]',
  amber:
    'bg-amber-50 dark:bg-amber-950/25 text-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800',
  rose: 'bg-rose-50 dark:bg-rose-950/25 text-rose-800 dark:text-rose-100 border-rose-200 dark:border-rose-800',
};

export function Pill({
  children,
  color,
  pulse,
}: {
  children: React.ReactNode;
  color: PillColor;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        colorClass[color],
      )}
    >
      {pulse && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500 pill-pulse-dot" />
      )}
      {children}
    </span>
  );
}
