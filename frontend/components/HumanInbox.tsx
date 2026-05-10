'use client';

import { useCoord } from '@/lib/store';
import { MessageCircleQuestion, Send, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { timeAgo } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

export function HumanInbox() {
  const questions = useCoord((s) => s.questions);
  const openQuestions = questions.filter(q => q.status === 'open');
  const answerQuestion = useCoord((s) => s.answerQuestion);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Auto-select the first open question
  const activeQ = openQuestions.find(q => q.id === activeId) || openQuestions[0];

  const onSubmit = async () => {
    if (!activeQ || !draft.trim() || submitting) return;
    setSubmitting(true);
    try {
      await answerQuestion(activeQ.id, draft.trim());
      setDraft('');
      setActiveId(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 py-4 border-b border-rose-100 bg-rose-50/50 flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-rose-800 text-sm flex items-center gap-2">
          <MessageCircleQuestion className="w-4 h-4 text-rose-500" />
          Needs Review
        </h2>
        {openQuestions.length > 0 && (
          <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            {openQuestions.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <AnimatePresence mode="popLayout">
          {openQuestions.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="h-full flex flex-col items-center justify-center text-center p-6 text-muted"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm font-medium">All clear.</p>
              <p className="text-xs mt-1 opacity-70">No active blockers.</p>
            </motion.div>
          ) : (
            <motion.div
              key={activeQ.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col h-full"
            >
              <div className="bg-rose-50/30 border border-rose-100 rounded-xl p-4 flex-1">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-text capitalize">{activeQ.asker_agent}</span>
                    <span className="text-muted/50 text-xs">asks...</span>
                  </div>
                  <span className="text-[10px] text-muted font-medium">{timeAgo(activeQ.created_at)}</span>
                </div>
                
                {activeQ.scope && (
                  <div className="mb-3">
                    <span className="font-mono text-xs text-rose-700 bg-rose-100/50 px-2 py-0.5 rounded-md">
                      {activeQ.scope}
                    </span>
                  </div>
                )}
                
                <p className="text-sm text-slate-800 leading-relaxed font-medium">
                  {activeQ.asks}
                </p>
              </div>

              <div className="mt-4 shrink-0">
                <div className="relative">
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        onSubmit();
                      }
                    }}
                    placeholder="Provide direction... (Cmd+Enter to send)"
                    className="w-full bg-slate-50 border border-border rounded-xl p-3 pr-12 text-sm text-text placeholder:text-muted/50 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                    rows={3}
                  />
                  <button
                    onClick={onSubmit}
                    disabled={!draft.trim() || submitting}
                    className="absolute right-2 bottom-2 p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500 transition-colors shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
