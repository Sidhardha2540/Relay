'use client';

import { AgentPanel } from '@/components/AgentPanel';
import { ConflictAlerts } from '@/components/ConflictAlerts';
import { DecisionLedger } from '@/components/DecisionLedger';
import { Header } from '@/components/Header';
import { HumanInbox } from '@/components/HumanInbox';
import { ScopeGraph } from '@/components/ScopeGraph';
import { useCoordSocket } from '@/lib/ws-client';

export default function Page() {
  useCoordSocket();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <Header />
      <main
        className="grid min-h-0 flex-1 overflow-hidden"
        style={{ gridTemplateColumns: '280px 1fr 300px' }}
      >
        <aside className="space-y-2 overflow-y-auto border-r border-[var(--border)] p-3">
          <AgentPanel />
        </aside>

        <div className="flex min-h-0 flex-col overflow-hidden border-[var(--border)]">
          <div className="min-h-0 flex-[3] overflow-y-auto border-b border-[var(--border)] p-4">
            <ScopeGraph />
          </div>
          <div className="min-h-0 flex-[2] overflow-y-auto p-4">
            <DecisionLedger />
          </div>
        </div>

        <aside className="space-y-4 overflow-y-auto border-l border-[var(--border)] p-3">
          <HumanInbox />
          <ConflictAlerts />
        </aside>
      </main>
    </div>
  );
}
