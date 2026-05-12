'use client';

import { useCoord } from '@/lib/store';
import { conflictsFromFeed, timeAgo } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';

export function ConflictAlerts() {
  const feed = useCoord((s) => s.feed);

  const conflicts = useMemo(() => conflictsFromFeed(feed).slice(0, 5), [feed]);

  return (
    <div className="space-y-2 border-t border-[var(--border)] pt-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
        Recent conflicts
      </h3>

      {conflicts.length === 0 ? (
        <p className="px-1 text-xs text-[var(--text-muted)]">No conflicts detected</p>
      ) : (
        <div className="space-y-0">
          {conflicts.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-2 border-b border-[var(--border)] py-2 last:border-0"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="text-xs leading-snug text-[var(--text)]">{c.summary}</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{timeAgo(c.ts)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
