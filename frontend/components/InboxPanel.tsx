'use client';

import { useState } from 'react';
import { useCoord } from '@/lib/store';
import { AgentBadge } from './AgentBadge';
import { timeAgo, cn } from '@/lib/utils';
import { AlertTriangle, Check, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Right panel: human triage queue.
 *
 * Sorted: blocking first, then by created_at ascending (oldest blockers first).
 * Each card has Answer / Resolve actions. Answer keeps the question alive
 * with status='answered'; Resolve closes it.
 *
 * Cursor TODO: when a 409 conflict comes in via a `decision_committed`
 * conflict path (server returns 409 to the agent — but agents are expected
 * to follow up by raising a question with `suggested_question`), surface
 * "Pick A / Pick B / Custom" buttons instead of free text.
 */
export function InboxPanel() {
  const questions = useCoord((s) =>
    s.questions
      .filter((q) => q.status === 'open' || q.status === 'answered')
      .sort((a, b) => {
        if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
        return a.created_at.localeCompare(b.created_at);
      })
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-border text-xs uppercase tracking-wider text-muted flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-question" />
        Inbox
        <span className="ml-auto font-mono text-[10px]">{questions.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {questions.length === 0 && (
          <div className="text-xs text-muted/70 italic py-6 text-center">
            No open questions. Agents working freely.
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {questions.map((q) => (
            <QuestionCard key={q.id} question={q} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function QuestionCard({
  question: q,
}: {
  question: ReturnType<typeof useCoord.getState>['questions'][number];
}) {
  const answer = useCoord((s) => s.answerQuestion);
  const resolve = useCoord((s) => s.resolveQuestion);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const conflictChoices = parseConflictChoices(q.asks);
  const usePresetChoices = conflictChoices !== null;

  const submit = async (kind: 'answer' | 'resolve') => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      if (kind === 'answer') await answer(q.id, draft.trim());
      else await resolve(q.id, draft.trim());
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  const resolveWithPreset = async (value: string) => {
    setBusy(true);
    try {
      await resolve(q.id, `Use ${value}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ x: -16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      layout
      className={cn(
        'border rounded-md p-3 bg-surface',
        q.blocking ? 'border-question/50 animate-pulseRed' : 'border-border'
      )}
    >
      <div className="flex items-center gap-2 mb-2 text-[11px]">
        <AgentBadge agent={q.asker_agent} />
        <span className="text-muted">→</span>
        <AgentBadge agent={q.target} />
        <span className="ml-auto text-[10px] text-muted font-mono">{timeAgo(q.created_at)}</span>
      </div>
      <div className="font-mono text-xs text-question mb-1.5 truncate">{q.scope}</div>
      <div className="text-sm text-text/90 mb-3">{q.asks}</div>

      {q.answer && (
        <div className="border-l-2 border-aider/50 pl-2 mb-3 text-xs text-text/70">
          <span className="text-aider">answered:</span> {q.answer}
        </div>
      )}

      {usePresetChoices && !showCustom ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={busy}
              onClick={() => resolveWithPreset(conflictChoices.existing)}
              className="text-xs px-2 py-1.5 bg-decision/20 hover:bg-decision/30 border border-decision/40 rounded
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Pick "{conflictChoices.existing}"
            </button>
            <button
              disabled={busy}
              onClick={() => resolveWithPreset(conflictChoices.proposed)}
              className="text-xs px-2 py-1.5 bg-cursor/20 hover:bg-cursor/30 border border-cursor/40 rounded
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Pick "{conflictChoices.proposed}"
            </button>
          </div>
          <button
            disabled={busy}
            onClick={() => setShowCustom(true)}
            className="w-full text-xs px-2 py-1.5 border border-border rounded hover:border-muted/60 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Custom…
          </button>
        </div>
      ) : (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a response…"
          rows={2}
          className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs font-mono
                    focus:outline-none focus:border-cursor resize-none"
        />
      )}
      {(!usePresetChoices || showCustom) && (
      <div className="flex gap-2 mt-2">
        <button
          disabled={busy || !draft.trim()}
          onClick={() => submit('answer')}
          className="flex-1 text-xs px-2 py-1.5 bg-cursor/20 hover:bg-cursor/30 border border-cursor/40 rounded
                     disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <Check className="w-3 h-3" /> Answer
        </button>
        <button
          disabled={busy || !draft.trim()}
          onClick={() => submit('resolve')}
          className="flex-1 text-xs px-2 py-1.5 bg-decision/20 hover:bg-decision/30 border border-decision/40 rounded
                     disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <X className="w-3 h-3" /> Resolve
        </button>
      </div>
      )}
    </motion.div>
  );
}

function parseConflictChoices(asks: string): { existing: string; proposed: string } | null {
  if (!asks.startsWith('Decision conflict on')) {
    return null;
  }
  const match = asks.match(/existing\s+`([^`]+)`[\s\S]*vs\s+proposed\s+`([^`]+)`/i);
  if (!match) {
    return null;
  }
  return {
    existing: match[1],
    proposed: match[2],
  };
}
