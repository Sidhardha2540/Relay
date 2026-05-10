'use client';

import { useCoord } from '@/lib/store';
import { motion } from 'framer-motion';
import { BookOpen, GitCommit, Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { timeAgo } from '@/lib/utils';

export function FloatingKnowledge() {
  const decisions = useCoord((s) => s.decisions);
  const discoveries = useCoord((s) => s.discoveries.filter((d) => !d.superseded));
  const [hovered, setHovered] = useState(false);

  const items = [...decisions.map(d => ({ ...d, _type: 'decision' as const })), ...discoveries.map(d => ({ ...d, _type: 'discovery' as const }))]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  if (items.length === 0) return null;

  return (
    <div 
      className="relative w-full h-full transform-style-3d perspective-[1000px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="absolute -top-10 left-0 flex items-center gap-2 text-slate-400 font-medium tracking-widest text-xs uppercase">
        <BookOpen className="w-4 h-4" /> Shared Knowledge
      </div>

      {items.map((item, i) => {
        const isDecision = item._type === 'decision';
        const zOffset = hovered ? i * -40 : i * -20;
        const yOffset = hovered ? i * 70 : i * 15;
        const scale = hovered ? 1 : 1 - (i * 0.05);
        const opacity = 1 - (i * 0.15);

        return (
          <motion.div
            key={'id' in item ? item.id : `${item.scope}-${item.key}-${item.sequence}`}
            className={`absolute top-0 left-0 w-full p-5 rounded-2xl backdrop-blur-xl border shadow-[0_8px_32px_rgba(0,0,0,0.04)] transition-colors ${
              isDecision 
                ? 'bg-emerald-50/70 border-emerald-200/50 hover:bg-emerald-50/90 hover:border-emerald-300' 
                : 'bg-blue-50/70 border-blue-200/50 hover:bg-blue-50/90 hover:border-blue-300'
            }`}
            animate={{
              z: zOffset,
              y: yOffset,
              scale,
              opacity,
              rotateX: hovered ? 0 : 5,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            style={{ transformOrigin: "top center" }}
          >
            <div className="flex items-start justify-between mb-3">
              <span className={`font-mono text-xs px-2 py-1 rounded-md ${isDecision ? 'text-emerald-700 bg-emerald-100/50' : 'text-blue-700 bg-blue-100/50'}`}>
                {item.scope}
              </span>
              {isDecision ? (
                <GitCommit className="w-4 h-4 text-emerald-500" />
              ) : (
                item.confidence === 'verified' ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : <Search className="w-4 h-4 text-blue-500" />
              )}
            </div>

            {isDecision ? (
              <>
                <div className="text-sm font-bold text-slate-800 mb-1">{item.key}</div>
                <div className="text-sm text-slate-600 bg-white/50 p-2 rounded-lg font-mono truncate">{item.value}</div>
              </>
            ) : (
              <div className="text-sm text-slate-700 leading-relaxed line-clamp-3">
                {item.summary}
              </div>
            )}

            <div className={`mt-4 text-[10px] font-medium flex justify-between ${isDecision ? 'text-emerald-600/70' : 'text-blue-600/70'}`}>
              <span>{item.agent}</span>
              <span>{timeAgo(item.created_at)}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
