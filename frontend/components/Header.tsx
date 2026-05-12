'use client';

import { useCoord } from '@/lib/store';
import { Pill } from '@/components/Pill';
import { Moon, Sun, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

function DarkModeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface2)] hover:text-[var(--text)]"
      aria-label="Toggle dark mode"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        connected
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`}
      />
      {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      <span>{connected ? 'Live' : 'Disconnected'}</span>
    </div>
  );
}

export function Header() {
  const connected = useCoord((s) => s.connected);
  const participants = useCoord((s) => s.participants);
  const intents = useCoord((s) => s.intents.filter((i) => i.status === 'active'));
  const openQuestions = useCoord((s) => s.questions.filter((q) => q.status === 'open'));

  const agentCount = participants.length;
  const activeIntentCount = intents.length;
  const openQuestionCount = openQuestions.length;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--decision)]">
          <span className="text-xs font-black text-white">C</span>
        </div>
        <span className="font-semibold tracking-tight text-[var(--text)]">Coord</span>
      </div>

      <div className="flex items-center gap-3">
        <Pill color="slate">{agentCount} agents</Pill>
        <Pill color="amber">{activeIntentCount} active</Pill>
        {openQuestionCount > 0 && (
          <Pill color="rose" pulse>
            {openQuestionCount} needs you
          </Pill>
        )}
      </div>

      <div className="flex items-center gap-3">
        <DarkModeToggle />
        <ConnectionBadge connected={connected} />
      </div>
    </header>
  );
}
