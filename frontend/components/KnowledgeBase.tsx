'use client';

import { useCoord } from '@/lib/store';
import { BookOpen, CheckCircle2, GitCommit, Search, ShieldCheck } from 'lucide-react';
import { timeAgo } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

export function KnowledgeBase() {
  const decisions = useCoord((s) => s.decisions);
  const discoveries = useCoord((s) => s.discoveries.filter((d) => !d.superseded));

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-6 py-5 border-b border-border/60 bg-gray-50/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-emerald-600" />
          </div>
          <h2 className="font-semibold text-text">Shared Knowledge</h2>
        </div>
        <div className="text-sm font-medium text-muted bg-white px-3 py-1 rounded-full border border-border shadow-sm">
          {decisions.length + discoveries.length} items
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Decisions Column */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <h3 className="font-semibold text-text text-sm">Decisions & Contracts</h3>
            </div>
            
            {decisions.length === 0 ? (
              <div className="p-6 border border-dashed border-border rounded-xl text-center text-sm text-muted bg-gray-50/50">
                No decisions recorded yet.
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {decisions.map((d) => (
                  <motion.div
                    key={`${d.scope}::${d.key}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/30 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-emerald-700 bg-emerald-100/50 px-2 py-0.5 rounded-md">{d.scope}</span>
                      <span className="text-[10px] font-mono text-emerald-600/50">#{d.sequence}</span>
                    </div>
                    <div className="text-sm font-medium text-text mb-1">
                      {d.key}
                    </div>
                    <div className="text-sm text-emerald-900 bg-white p-2.5 rounded-lg border border-emerald-100 shadow-sm break-words font-mono">
                      {d.value}
                    </div>
                    <div className="mt-3 text-[11px] text-emerald-600/70 font-medium flex items-center gap-1.5">
                      <GitCommit className="w-3 h-3" />
                      Committed by {d.agent}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Discoveries Column */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold text-text text-sm">Discoveries & Facts</h3>
            </div>

            {discoveries.length === 0 ? (
              <div className="p-6 border border-dashed border-border rounded-xl text-center text-sm text-muted bg-gray-50/50">
                No discoveries recorded yet.
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {discoveries.map((d) => (
                  <motion.div
                    key={d.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl border border-blue-100 bg-blue-50/30 shadow-sm flex flex-col h-full"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="font-mono text-xs text-blue-700 bg-blue-100/50 px-2 py-0.5 rounded-md truncate">{d.scope}</span>
                      {d.confidence === 'verified' && (
                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          <ShieldCheck className="w-3 h-3" /> Verified
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-blue-100 shadow-sm flex-1">
                      {d.summary}
                    </div>
                    <div className="mt-3 text-[11px] text-blue-600/70 font-medium flex items-center justify-between">
                      <span>Found by {d.agent}</span>
                      <span>{timeAgo(d.created_at)}</span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
