'use client';

import { useCoord } from '@/lib/store';
import { useCoordSocket } from '@/lib/ws-client';
import { StatePanel } from '@/components/StatePanel';
import { ActivityFeed } from '@/components/ActivityFeed';
import { InboxPanel } from '@/components/InboxPanel';
import { TopBar } from '@/components/TopBar';
import { useEffect, useState } from 'react';

export default function Page() {
  // Mount the WebSocket once. Store handles everything from here.
  useCoordSocket();

  const connected = useCoord((s) => s.connected);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';
    setDemoMode(isDemo);
  }, []);

  return (
    <main className="h-screen w-screen flex flex-col bg-bg text-text">
      <TopBar connected={connected} demoMode={demoMode} />
      <div
        className="flex-1 grid gap-px bg-border overflow-hidden"
        style={{ gridTemplateColumns: '30% 40% 30%' }}
      >
        <section className="bg-bg overflow-hidden flex flex-col">
          <StatePanel />
        </section>
        <section className="bg-bg overflow-hidden flex flex-col">
          <ActivityFeed />
        </section>
        <section className="bg-bg overflow-hidden flex flex-col">
          <InboxPanel />
        </section>
      </div>
    </main>
  );
}
