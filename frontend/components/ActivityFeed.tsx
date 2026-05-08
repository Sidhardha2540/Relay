'use client';

import { useCoord } from '@/lib/store';
import { AgentBadge } from './AgentBadge';
import { timeAgo, cn } from '@/lib/utils';
import type { FeedItem } from '@/lib/types';
import { GitCommit, FileSearch, Clock, MessageCircleQuestion } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

/**
 * Center timeline. New events animate in at the top.
 *
 * Cursor TODO: replace the plain `animate-slideIn` with Framer Motion
 * `<AnimatePresence mode="popLayout">` so reordering is smooth.
 * Keep auto-scroll-to-top unless the user has scrolled away.
 */
export function ActivityFeed() {
  const feed = useCoord((s) => s.feed);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const wasNearTopRef = useRef(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      wasNearTopRef.current = el.scrollTop <= 48;
    };
    onScroll();
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || feed.length === 0 || !wasNearTopRef.current) return;
    el.scrollTo({ top: 0, behavior: 'smooth' });
  }, [feed]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-border text-xs uppercase tracking-wider text-muted">
        Live activity
      </div>
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {feed.length === 0 && (
          <div className="text-xs text-muted/70 italic py-6 text-center">
            Waiting for events…
            <br />
            <span className="text-muted/50">
              Run an agent or seed the demo to see traffic.
            </span>
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {feed.map((item) => (
            <FeedRow key={item.id} item={item} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const Icon = ICONS[item.kind];
  const colorClass = COLORS[item.kind];

  return (
    <motion.div
      initial={{ x: -16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      layout
      className={cn(
        'border border-border rounded-md p-2 bg-surface flex gap-2',
        'hover:border-muted/40 transition-colors',
      )}
    >
      <Icon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', colorClass)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[11px]">
          <AgentBadge agent={item.agent} />
          <span className="text-muted">·</span>
          <span className={cn('font-mono', colorClass)}>{item.kind}</span>
          {item.scope && (
            <>
              <span className="text-muted">·</span>
              <span className="font-mono text-muted truncate">{item.scope}</span>
            </>
          )}
          <span className="ml-auto text-[10px] text-muted/70 font-mono shrink-0">
            {timeAgo(item.ts)}
          </span>
        </div>
        <div className="mt-1 text-xs text-text/90 break-words">{item.summary}</div>
      </div>
    </motion.div>
  );
}

const ICONS = {
  decision:  GitCommit,
  discovery: FileSearch,
  intent:    Clock,
  question:  MessageCircleQuestion,
  system:    Clock,
} as const;

const COLORS = {
  decision:  'text-decision',
  discovery: 'text-discovery',
  intent:    'text-intent',
  question:  'text-question',
  system:    'text-muted',
} as const;
