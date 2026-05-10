'use client';

import { useCoord } from '@/lib/store';
import { agentColorClass, timeAgo } from '@/lib/utils';
import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Question } from '@/lib/types';

export function ActivityLogs() {
  const decisions = useCoord(s => s.decisions);
  const intents = useCoord(s => s.intents);
  const discoveries = useCoord(s => s.discoveries);
  const questions = useCoord(s => s.questions);
  const answerQuestion = useCoord(s => s.answerQuestion);
  const resolveQuestion = useCoord(s => s.resolveQuestion);

  return (
    <div className="w-full max-w-[1600px] mx-auto h-[calc(100vh-140px)] flex flex-col">
      <div className="flex justify-between items-end mb-6">
        <h2 className="text-2xl font-bold text-text">System Activity Logs</h2>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 min-h-0">
        
        {/* Decisions Column */}
        <LogColumn title="📌 Decisions" count={decisions.length} color="text-indigo-500">
          {decisions.slice().reverse().map(d => (
            <LogCard key={`${d.scope}-${d.key}-${d.sequence}`} agent={d.agent} scope={d.scope} title={`${d.key} = ${d.value}`} ts={d.created_at} type="decision" />
          ))}
        </LogColumn>

        {/* Intents Column */}
        <LogColumn title="🔒 Active Intents" count={intents.length} color="text-amber-500">
          {intents.map(i => (
            <LogCard key={i.id} agent={i.agent} scope={i.scope} title={i.action} ts={i.created_at} type="intent" />
          ))}
        </LogColumn>

        {/* Discoveries Column */}
        <LogColumn title="🔍 Discoveries" count={discoveries.length} color="text-emerald-500">
          {discoveries.map(d => (
            <LogCard key={d.id} agent={d.agent} scope={d.scope} title={d.summary} ts={d.created_at} type="discovery" />
          ))}
        </LogColumn>

        {/* Questions Column */}
        <LogColumn title="❓ Questions" count={questions.length} color="text-rose-500">
          {questions.map(q => (
            <QuestionCard key={q.id} q={q} answerQuestion={answerQuestion} resolveQuestion={resolveQuestion} />
          ))}
        </LogColumn>

      </div>
    </div>
  );
}

function LogColumn({ title, count, color, children }: { title: string, count: number, color: string, children: React.ReactNode }) {
  return (
    <div className="bg-bg border border-border rounded-2xl p-4 flex flex-col min-h-0">
      <div className={`flex items-center gap-2 text-sm font-bold pb-3 border-b border-border mb-3 ${color}`}>
        <span>{title}</span>
        <span className="ml-auto bg-surface border border-border rounded-xl px-2 py-0.5 text-xs text-muted">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto pr-1 space-y-3 scrollbar-thin">
        {React.Children.count(children) === 0 ? (
          <p className="text-xs text-muted italic text-center mt-4">No events yet.</p>
        ) : children}
      </div>
    </div>
  );
}

function LogCard({ agent, scope, title, desc, ts, type }: { agent: string, scope: string, title: string, desc?: string, ts: string, type: 'decision'|'intent'|'discovery'|'question' }) {
  const borderColors = {
    decision: 'before:bg-indigo-500',
    intent: 'before:bg-amber-500',
    discovery: 'before:bg-emerald-500',
    question: 'before:bg-rose-500',
  };

  return (
    <div className={`bg-surface border border-border rounded-xl p-3.5 shadow-sm relative overflow-hidden ${borderColors[type]} before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1`}>
      <div className="flex justify-between items-center mb-2 gap-2">
        <div className="text-[11px] font-semibold text-muted flex items-center gap-1.5 truncate">
          <div className={`w-2 h-2 rounded-full bg-current ${agentColorClass(agent)}`} />
          <span className="truncate">{agent}</span>
        </div>
        <div className="text-[10px] font-mono bg-bg px-1.5 py-0.5 rounded border border-border truncate max-w-[50%] shrink-0" title={scope}>
          {scope}
        </div>
      </div>
      <div className="text-[13px] font-semibold text-text leading-snug break-words">{title}</div>
      {desc && <div className="text-xs text-muted mt-1.5 leading-snug">{desc}</div>}
      <div className="text-[10px] text-subtle mt-2 font-mono">{timeAgo(ts)}</div>
    </div>
  );
}

function QuestionCard({ q, answerQuestion, resolveQuestion }: { q: Question, answerQuestion: (id: string, ans: string) => void, resolveQuestion: (id: string, res: string) => void }) {
  const [val, setVal] = useState('');
  const isTargeted = q.target === 'human';
  const isOpen = q.status === 'open';

  return (
    <div className="bg-surface border border-border rounded-xl p-3.5 shadow-sm relative overflow-hidden before:bg-rose-500 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1">
      <div className="flex justify-between items-center mb-2 gap-2">
        <div className="text-[11px] font-semibold text-muted flex items-center gap-1.5 truncate">
          <div className={`w-2 h-2 rounded-full bg-current ${agentColorClass(q.asker_agent)}`} />
          <span className="truncate">{q.asker_agent}</span>
        </div>
        <div className="text-[10px] font-mono bg-bg px-1.5 py-0.5 rounded border border-border truncate max-w-[50%] shrink-0" title={q.scope}>
          {q.scope}
        </div>
      </div>
      
      <div className="text-[13px] font-semibold text-text leading-snug break-words mb-2">{q.asks}</div>
      
      {!isOpen ? (
        <div className="text-xs text-muted mt-1.5 leading-snug">
          {q.status === 'answered' ? `✓ ${q.answer}` : `✓ ${q.resolution}`}
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            placeholder={isTargeted ? "Type answer..." : "Resolve..."}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && val.trim()) {
                isTargeted ? answerQuestion(q.id, val) : resolveQuestion(q.id, val);
                setVal('');
              }
            }}
            className="flex-1 bg-bg border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-rose-500/50"
          />
          <button
            disabled={!val.trim()}
            onClick={() => {
              isTargeted ? answerQuestion(q.id, val) : resolveQuestion(q.id, val);
              setVal('');
            }}
            className="bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white p-1.5 rounded-lg flex items-center justify-center transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      
      <div className="text-[10px] text-subtle mt-2 font-mono">{timeAgo(q.created_at)}</div>
    </div>
  );
}
