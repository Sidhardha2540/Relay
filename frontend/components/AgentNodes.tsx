'use client';

import { useCoord } from '@/lib/store';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { Bot, TerminalSquare, Code2, Sparkles, User, Activity } from 'lucide-react';
import { timeUntil } from '@/lib/utils';

const AGENT_CONFIG: Record<string, { name: string; color: string; bg: string; icon: any }> = {
  'claude-code': { name: 'Claude', color: 'text-amber-500', bg: 'bg-amber-500/20', icon: Sparkles },
  'cursor': { name: 'Cursor', color: 'text-indigo-500', bg: 'bg-indigo-500/20', icon: TerminalSquare },
  'aider': { name: 'Aider', color: 'text-emerald-500', bg: 'bg-emerald-500/20', icon: Code2 },
  'antigravity': { name: 'Antigravity', color: 'text-cyan-500', bg: 'bg-cyan-500/20', icon: Sparkles },
  'human': { name: 'Human', color: 'text-slate-500', bg: 'bg-slate-500/20', icon: User },
};

export function AgentNodes() {
  const feed = useCoord((s) => s.feed);
  const intents = useCoord((s) => s.intents);
  const now = Date.now();

  const activeAgents = useMemo(() => {
    const byAgent = new Map<string, number>();
    for (const item of feed) {
      if (!item.agent) continue;
      const ts = new Date(item.ts).getTime();
      const prev = byAgent.get(item.agent);
      if (!prev || ts > prev) byAgent.set(item.agent, ts);
    }
    for (const intent of intents) {
      if (!intent.agent) continue;
      const ts = intent.created_at ? new Date(intent.created_at).getTime() : now;
      const prev = byAgent.get(intent.agent);
      if (!prev || ts > prev) byAgent.set(intent.agent, ts);
    }
    return Array.from(byAgent.entries())
      .map(([agentId, lastSeen]) => {
        const active = now - lastSeen < 120_000;
        const agentIntents = intents.filter(i => i.agent === agentId);
        return { agentId, active, intents: agentIntents, lastSeen };
      })
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }, [feed, intents, now]);

  if (activeAgents.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <Activity className="w-8 h-8 animate-pulse opacity-50" />
          <span className="text-sm font-medium tracking-widest uppercase">Waiting for signals</span>
        </div>
      </div>
    );
  }

  // Calculate orbit positions
  const radius = 180;
  
  return (
    <div className="absolute inset-0 flex items-center justify-center transform-style-3d">
      {activeAgents.map((agent, i) => {
        const angle = (i / activeAgents.length) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const config = AGENT_CONFIG[agent.agentId] || { name: agent.agentId, color: 'text-slate-500', bg: 'bg-slate-500/20', icon: Bot };
        const Icon = config.icon;

        return (
          <motion.div
            key={agent.agentId}
            className={`absolute flex items-center justify-center transform-style-3d transition-opacity duration-1000 ${agent.active || agent.intents.length > 0 ? 'opacity-100' : 'opacity-40 grayscale'}`}
            animate={{
              x,
              z,
              y: [0, -10, 0], // subtle floating
            }}
            transition={{
              y: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 },
              x: { type: "spring", stiffness: 50 },
              z: { type: "spring", stiffness: 50 },
            }}
          >
            {/* Glowing Orb */}
            <div className={`relative w-20 h-20 rounded-full flex items-center justify-center backdrop-blur-md shadow-lg border border-white/20 ${config.bg}`}>
              <Icon className={`w-8 h-8 ${config.color}`} />
              <div className="absolute inset-0 rounded-full border border-white/40 animate-ping opacity-20" />
            </div>

            {/* Intent floating label */}
            {agent.intents.length > 0 && (
              <motion.div 
                className="absolute top-24 w-48 p-3 rounded-xl bg-white/80 backdrop-blur-xl border shadow-xl text-center pointer-events-none"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-1">{config.name} is working on</div>
                <div className="text-xs font-medium text-slate-800 line-clamp-2">{agent.intents[0].action}</div>
                <div className="mt-2 flex justify-center gap-1">
                  {agent.intents.length > 1 && (
                    <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">+{agent.intents.length - 1} MORE</span>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
