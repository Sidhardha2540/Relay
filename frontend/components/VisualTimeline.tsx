'use client';

import { useCoord } from '@/lib/store';
import { timeAgo } from '@/lib/utils';
import { GitCommit, FileSearch, Clock, MessageCircleQuestion, Activity } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

const EVENT_CONFIG: Record<string, { icon: any, color: string, bg: string, border: string }> = {
  decision:  { icon: GitCommit, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  discovery: { icon: FileSearch, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  intent:    { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  question:  { icon: MessageCircleQuestion, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
  system:    { icon: Activity, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
};

export function VisualTimeline() {
  const feed = useCoord((s) => s.feed);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el && feed.length > 0) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [feed]);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 py-4 border-b border-border/60 bg-gray-50/50">
        <h2 className="font-semibold text-text text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-500" />
          Activity Flow
        </h2>
      </div>
      
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 py-4">
        {feed.length === 0 ? (
          <div className="text-sm text-muted text-center py-8 italic">
            Waiting for activity...
          </div>
        ) : (
          <div className="relative border-l-2 border-slate-100 ml-4 space-y-6 pb-4">
            <AnimatePresence mode="popLayout">
              {feed.map((item, i) => {
                const config = EVENT_CONFIG[item.kind] || EVENT_CONFIG.system;
                const Icon = config.icon;
                
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="relative pl-6"
                  >
                    {/* Timeline Dot */}
                    <div className={`absolute -left-[11px] top-1 w-[20px] h-[20px] rounded-full bg-white border-2 ${config.border} flex items-center justify-center shadow-sm z-10`}>
                      <div className={`w-2 h-2 rounded-full ${config.bg.replace('50', '400')}`} />
                    </div>

                    <div className="bg-white border border-border/60 rounded-xl shadow-sm p-3 hover:shadow-md transition-shadow group">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-semibold text-text capitalize">{item.agent || 'System'}</span>
                          <span className="text-muted/50">•</span>
                          <span className={`font-medium ${config.color} capitalize flex items-center gap-1`}>
                            <Icon className="w-3 h-3" />
                            {item.kind}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted/70 font-medium group-hover:text-muted transition-colors">
                          {timeAgo(item.ts)}
                        </span>
                      </div>
                      
                      {item.scope && (
                        <div className="mb-1.5 inline-block">
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {item.scope}
                          </span>
                        </div>
                      )}
                      
                      <div className="text-sm text-slate-700 leading-relaxed break-words">
                        {item.summary}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
