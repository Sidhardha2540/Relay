'use client';

import { useCoord } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState, useEffect, useRef } from 'react';
import { AgentAvatar } from './AgentAvatar';

export function SpatialCanvas({ animationsEnabled = true }: { animationsEnabled?: boolean }) {
  const feed = useCoord((s) => s.feed);
  const intents = useCoord((s) => s.intents);
  const openQuestions = useCoord((s) => s.questions.filter(q => q.status === 'open'));
  const hasBlockers = openQuestions.length > 0;
  
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

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
      .sort((a, b) => a.agentId.localeCompare(b.agentId)); // sort for stable positions
  }, [feed, intents, now]);

  const positionedAgents = useMemo(() => {
    let currentRing = 1;
    let agentsInRingCount = 0;
    let ringCapacity = 6;
    let currentRadius = 180;

    return activeAgents.map((agent, i) => {
      if (agentsInRingCount >= ringCapacity) {
        currentRing++;
        agentsInRingCount = 0;
        ringCapacity = currentRing * 6; // 6, 12, 18...
        currentRadius += 150;
      }
      
      const angle = (agentsInRingCount / ringCapacity) * Math.PI * 2;
      agentsInRingCount++;

      return {
        ...agent,
        x: Math.cos(angle) * currentRadius,
        y: Math.sin(angle) * currentRadius,
        radius: currentRadius
      };
    });
  }, [activeAgents]);

  const maxRadius = positionedAgents.length > 0 ? Math.max(...positionedAgents.map(a => a.radius)) : 180;
  // Use 1000px padding so there's plenty of breathing room at the top
  const canvasSize = Math.max(1500, maxRadius * 2 + 1000);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to center when the canvas size changes or on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (canvasSize - scrollRef.current.clientHeight) / 2;
      scrollRef.current.scrollLeft = (canvasSize - scrollRef.current.clientWidth) / 2;
    }
  }, [canvasSize]);

  const sharedScopes = useMemo(() => {
    const map = new Map<string, Set<string>>();
    feed.forEach(f => {
      if (!f.agent) return;
      if (!map.has(f.agent)) map.set(f.agent, new Set());
      map.get(f.agent)!.add(f.scope);
    });
    return map;
  }, [feed]);

  const lines = useMemo(() => {
    const result = [];
    // 1. Line from every agent to the Center Daemon (0,0)
    for (let i = 0; i < positionedAgents.length; i++) {
      const a = positionedAgents[i];
      result.push({ id: `center-${a.agentId}`, a: {x: 0, y: 0}, b: a, d: `M0,0 L${a.x},${a.y}`, type: 'system' });
    }

    // 2. Lines between agents if they share scopes
    for (let i = 0; i < positionedAgents.length; i++) {
      for (let j = i + 1; j < positionedAgents.length; j++) {
        const a = positionedAgents[i];
        const b = positionedAgents[j];
        
        const scopesA = sharedScopes.get(a.agentId);
        const scopesB = sharedScopes.get(b.agentId);
        let shared = 0;
        if (scopesA && scopesB) {
          scopesA.forEach(s => { if (scopesB.has(s)) shared++; });
        }
        
        if (shared > 0) {
          const cx = (a.x + b.x) / 2;
          const cy = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const nx = -dy * 0.1;
          const ny = dx * 0.1;
          result.push({ id: `${a.agentId}-${b.agentId}`, a, b, d: `M${a.x},${a.y} Q${cx+nx},${cy+ny} ${b.x},${b.y}`, type: 'collab' });
        }
      }
    }
    return result;
  }, [positionedAgents, sharedScopes]);

  // Packets: Data Driven from Feed
  const [packets, setPackets] = useState<{ id: string; x: number; y: number; tx: number; ty: number; color: string }[]>([]);
  const prevFeedLength = useRef(feed.length);

  useEffect(() => {
    if (!animationsEnabled) return;
    
    if (feed.length > prevFeedLength.current) {
      const newItems = feed.slice(prevFeedLength.current);
      newItems.forEach(item => {
        if (!item.agent) return;
        const agentNode = positionedAgents.find(a => a.agentId === item.agent);
        if (!agentNode) return;
        
        const id = Math.random().toString(36).substr(2, 9);
        const color = item.kind === 'decision' ? '#6366F1' : item.kind === 'intent' ? '#F59E0B' : item.kind === 'discovery' ? '#10B981' : '#F43F5E';
        
        // Shoot packet from Agent to Center Hub
        setPackets(p => [...p, { id, x: agentNode.x, y: agentNode.y, tx: 0, ty: 0, color }]);
        
        setTimeout(() => {
          setPackets(p => p.filter(pkt => pkt.id !== id));
        }, 1500);
      });
    }
    prevFeedLength.current = feed.length;
  }, [feed, positionedAgents, animationsEnabled]);

  if (activeAgents.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted">
          <div className="w-8 h-8 rounded-full border-2 border-muted border-t-transparent animate-spin opacity-50" />
          <span className="text-sm font-medium tracking-widest uppercase">Waiting for signals</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="absolute inset-0 overflow-auto scroll-smooth bg-[radial-gradient(ellipse_at_center,var(--surface)_0%,var(--bg)_100%)] scrollbar-thin">
      <div 
        className="relative" 
        style={{ width: canvasSize, height: canvasSize }}
      >
        <div className="absolute top-1/2 left-1/2 w-0 h-0 flex items-center justify-center">
          {/* Lines Layer */}
          <svg className="absolute overflow-visible pointer-events-none z-0">
          {lines.map(line => (
            <path key={line.id} d={line.d} fill="none" stroke="var(--border2)" strokeWidth="2" strokeDasharray="6 6" opacity="0.5" />
          ))}
          {/* Animated Packets */}
          <AnimatePresence>
            {packets.map(p => (
              <motion.circle
                key={p.id}
                r="6"
                fill={p.color}
                initial={{ cx: p.x, cy: p.y, opacity: 0 }}
                animate={{ cx: p.tx, cy: p.ty, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
              />
            ))}
          </AnimatePresence>
        </svg>

        {/* Center Hub (Coord Daemon) */}
        <div className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20" style={{ left: 0, top: 0 }}>
          <div className="w-16 h-16 rounded-full bg-surface border-4 border-border2 shadow-lg flex items-center justify-center relative">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30 animate-ping" />
            <span className="text-[10px] font-bold tracking-widest text-text">HUB</span>
          </div>
        </div>

        {/* Agents Layer */}
        {positionedAgents.map((agent) => (
          <motion.div
            key={agent.agentId}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 cursor-pointer z-10"
            style={{ left: agent.x, top: agent.y }}
            animate={{ y: animationsEnabled ? [agent.y, agent.y - 8, agent.y] : agent.y }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            whileHover={{ scale: 1.1, zIndex: 50 }}
          >
            <div className={`relative transition-opacity duration-1000 ${agent.active || agent.intents.length > 0 ? 'opacity-100' : 'opacity-40 grayscale'}`}>
              <AgentAvatar agentId={agent.agentId} size={70} />
            </div>
            
            <div className="flex flex-col items-center gap-1">
              <div className="bg-surface border border-border rounded-full px-3 py-1 text-xs font-bold text-text shadow-sm whitespace-nowrap">
                {agent.agentId}
              </div>
              
              {/* Compact Intent Badge */}
              {agent.intents.length > 0 && (
                <div className="bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm max-w-[140px] truncate whitespace-nowrap" title={agent.intents[0].action}>
                  {agent.intents[0].action}
                </div>
              )}
            </div>
          </motion.div>
        ))}

          {/* Removed InteractiveInbox to prevent blocking the canvas */}
        </div>
      </div>
    </div>
  );
}
