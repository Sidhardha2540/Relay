'use client';

import { useCoord } from '@/lib/store';
import { useCoordSocket } from '@/lib/ws-client';
import { useEffect, useState } from 'react';
import { TopHeader } from '@/components/TopHeader';
import { SpatialCanvas } from '@/components/SpatialCanvas';
import { AgentRoster } from '@/components/AgentRoster';
import { ActivityLogs } from '@/components/ActivityLogs';

export default function Page() {
  useCoordSocket();

  const connected = useCoord((s) => s.connected);
  const [demoMode, setDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'canvas' | 'roster' | 'logs'>('canvas');
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  useEffect(() => {
    const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';
    setDemoMode(isDemo);
  }, []);

  return (
    <main className="h-screen w-screen flex flex-col bg-bg text-text overflow-hidden selection:bg-indigo-100 font-sans">
      <TopHeader 
        connected={connected} 
        demoMode={demoMode} 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        animationsEnabled={animationsEnabled}
        setAnimationsEnabled={setAnimationsEnabled}
      />
      
      <div className="flex-1 relative w-full h-full overflow-hidden">
        {activeTab === 'canvas' && <SpatialCanvas animationsEnabled={animationsEnabled} />}
        {activeTab === 'roster' && (
          <div className="absolute inset-0 overflow-y-auto p-6 scrollbar-thin">
            <AgentRoster />
          </div>
        )}
        {activeTab === 'logs' && (
          <div className="absolute inset-0 overflow-y-auto p-6 scrollbar-thin">
            <ActivityLogs />
          </div>
        )}
      </div>
    </main>
  );
}
