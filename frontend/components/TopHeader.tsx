'use client';

import { useCoord } from '@/lib/store';
import { Activity, Wifi, WifiOff, Moon, Sun } from 'lucide-react';
import { useState, useEffect } from 'react';

interface TopHeaderProps {
  connected: boolean;
  demoMode: boolean;
  activeTab: 'canvas' | 'roster' | 'logs';
  setActiveTab: (tab: 'canvas' | 'roster' | 'logs') => void;
  animationsEnabled: boolean;
  setAnimationsEnabled: (v: boolean) => void;
}

export function TopHeader({ connected, demoMode, activeTab, setActiveTab, animationsEnabled, setAnimationsEnabled }: TopHeaderProps) {
  const replayDemo = useCoord((s) => s.replayDemo);
  const openQuestions = useCoord((s) => s.questions.filter(q => q.status === 'open').length);
  const [replaying, setReplaying] = useState(false);

  const onReplay = async () => {
    setReplaying(true);
    try {
      await replayDemo();
    } finally {
      setReplaying(false);
    }
  };

  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    if (document.documentElement.classList.contains('dark')) {
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  };

  return (
    <header className="h-16 px-6 flex items-center justify-between border-b border-border bg-surface shadow-sm relative z-10">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-text flex items-center justify-center">
          <Activity className="w-5 h-5 text-bg" />
        </div>
        <div>
          <h1 className="font-bold text-text text-xl leading-none tracking-tight">Coord</h1>
        </div>
      </div>

      <div className="w-px h-7 bg-border mx-2" />

      <div className="flex gap-2">
        <button 
          onClick={() => setActiveTab('canvas')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${activeTab === 'canvas' ? 'bg-surface border-border shadow-sm text-text' : 'border-transparent text-muted hover:bg-bg hover:text-text'}`}
        >
          Live Canvas
        </button>
        <button 
          onClick={() => setActiveTab('roster')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${activeTab === 'roster' ? 'bg-surface border-border shadow-sm text-text' : 'border-transparent text-muted hover:bg-bg hover:text-text'}`}
        >
          Agent Roster
        </button>
        <button 
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border flex items-center gap-2 ${activeTab === 'logs' ? 'bg-surface border-border shadow-sm text-text' : 'border-transparent text-muted hover:bg-bg hover:text-text'}`}
        >
          Activity Logs
          {openQuestions > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white relative shadow-sm">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative">{openQuestions}</span>
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-4 text-sm font-medium text-muted ml-auto">
        <button onClick={toggleTheme} className="p-1.5 rounded-lg border border-border bg-bg hover:bg-surface transition-all text-muted hover:text-text">
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border border-border bg-bg hover:bg-surface transition-all text-sm font-medium text-muted hover:text-text select-none">
          <input 
            type="checkbox" 
            checked={animationsEnabled} 
            onChange={(e) => setAnimationsEnabled(e.target.checked)} 
            className="cursor-pointer"
          />
          Play Animations
        </label>

        {demoMode && (
          <div className="flex items-center gap-2 ml-2">
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-xs border border-indigo-100">Demo Mode</span>
            <button
              onClick={onReplay}
              disabled={replaying}
              className="px-3 py-1.5 rounded-md bg-surface border border-border hover:bg-bg shadow-sm disabled:opacity-50 transition-all text-xs text-text"
            >
              {replaying ? 'Replaying…' : 'Replay Traffic'}
            </button>
          </div>
        )}

        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${connected ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
          {connected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          <span className="text-xs">{connected ? 'Live' : 'Reconnecting'}</span>
        </div>
      </div>
    </header>
  );
}
