'use client';

import { useCoord } from '@/lib/store';
import { timeAgo } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ShieldAlert, Send } from 'lucide-react';
import { useState } from 'react';

export function InteractiveInbox() {
  const questions = useCoord((s) => s.questions.filter(q => q.status === 'open'));
  const answerQuestion = useCoord((s) => s.answerQuestion);
  const resolveQuestion = useCoord((s) => s.resolveQuestion);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  if (questions.length === 0) return null;

  return (
    <motion.div 
      className="relative z-50 flex flex-col gap-6 max-w-2xl w-full mx-4"
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
      <div className="bg-rose-500 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center justify-center gap-3 font-bold uppercase tracking-widest text-sm w-max mx-auto">
        <ShieldAlert className="w-5 h-5" /> Human Attention Required
      </div>

      {questions.map((q) => {
        const isTargeted = q.target === 'human';
        const val = inputs[q.id] || '';

        return (
          <div key={q.id} className="bg-white/90 backdrop-blur-2xl border border-rose-100 rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-rose-500 mb-1">{q.asker_agent} asks...</div>
                <div className="inline-block px-2.5 py-1 rounded bg-rose-100 text-rose-800 text-[10px] font-mono mb-4">{q.scope}</div>
              </div>
              <div className="text-xs font-medium text-slate-400">{timeAgo(q.created_at)}</div>
            </div>

            <p className="text-xl font-medium text-slate-800 leading-relaxed mb-8">{q.asks}</p>

            <div className="flex gap-3">
              <input
                type="text"
                placeholder={isTargeted ? "Type your answer..." : "Provide a resolution..."}
                value={val}
                onChange={(e) => setInputs({ ...inputs, [q.id]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && val.trim()) {
                    isTargeted ? answerQuestion(q.id, val) : resolveQuestion(q.id, val);
                    setInputs({ ...inputs, [q.id]: '' });
                  }
                }}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-shadow"
              />
              <button
                disabled={!val.trim()}
                onClick={() => {
                  isTargeted ? answerQuestion(q.id, val) : resolveQuestion(q.id, val);
                  setInputs({ ...inputs, [q.id]: '' });
                }}
                className="bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2"
              >
                Send <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
