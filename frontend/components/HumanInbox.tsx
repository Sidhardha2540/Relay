'use client';

import { useCoord } from '@/lib/store';
import { AgentBadge } from '@/components/AgentBadge';
import { CheckCircle } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export function HumanInbox() {
  const questions = useCoord((s) => s.questions);
  const answerQuestion = useCoord((s) => s.answerQuestion);
  const resolveQuestion = useCoord((s) => s.resolveQuestion);

  const open = useMemo(
    () => questions.filter((q) => q.status === 'open'),
    [questions],
  );

  const blocking = open.filter((q) => q.blocking);
  const nonBlocking = open.filter((q) => !q.blocking);

  const [answers, setAnswers] = useState<Record<string, string>>({});

  const setAnswer = useCallback((id: string, value: string) => {
    setAnswers((a) => ({ ...a, [id]: value }));
  }, []);

  const handleAnswer = async (id: string, q: { target: string }) => {
    const text = (answers[id] || '').trim();
    if (!text) return;
    if (q.target === 'human') {
      await answerQuestion(id, text);
    } else {
      await resolveQuestion(id, text);
    }
    setAnswers((a) => {
      const next = { ...a };
      delete next[id];
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-[var(--text)]">Inbox</h2>

      {open.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-[var(--text-muted)]">
          <CheckCircle className="h-8 w-8 opacity-30" />
          <p className="text-sm">Nothing needs your attention</p>
        </div>
      ) : (
        <div className="space-y-4">
          {blocking.map((q) => (
            <div
              key={q.id}
              className="space-y-3 rounded-xl border-2 border-rose-300 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/20"
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                <span className="text-xs font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                  Blocking — needs your input
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <AgentBadge agentId={String(q.asker_agent)} small /> is asking:
              </div>

              <p className="text-sm font-medium leading-snug text-[var(--text)]">{q.asks}</p>
              <p className="font-mono text-xs text-[var(--text-muted)]">{q.scope}</p>

              <div className="space-y-2">
                <textarea
                  className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-rose-300 dark:focus:ring-rose-700"
                  rows={2}
                  placeholder="Your answer..."
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => handleAnswer(q.id, q)}
                  className="w-full rounded-lg bg-rose-500 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600"
                >
                  Send Answer
                </button>
              </div>
            </div>
          ))}

          {nonBlocking.map((q) => (
            <div
              key={q.id}
              className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 dark:bg-[var(--surface2)]"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Non-blocking
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <AgentBadge agentId={String(q.asker_agent)} small />
              </div>
              <p className="text-xs leading-snug text-[var(--text)]">{q.asks}</p>
              <p className="font-mono text-[10px] text-[var(--text-muted)]">{q.scope}</p>
              <textarea
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
                rows={2}
                placeholder={q.target === 'human' ? 'Your answer…' : 'Resolution…'}
                value={answers[q.id] || ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
              />
              <button
                type="button"
                onClick={() => handleAnswer(q.id, q)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface2)] py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--border)]/40"
              >
                Submit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
