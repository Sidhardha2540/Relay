'use client';

import { useCoord } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';

export function ActivityParticles() {
  const feed = useCoord((s) => s.feed).slice(0, 10); // Show last 10 events as flowing particles

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none transform-style-3d perspective-[1200px]">
      <AnimatePresence>
        {feed.map((item, i) => {
          // Determine random start/end positions for a flowing effect from top right to bottom left
          const startX = Math.random() * 400 + 400; // Right side
          const startY = -200 - Math.random() * 200; // Top
          const endX = -400 - Math.random() * 400; // Left side
          const endY = 800 + Math.random() * 200; // Bottom
          const z = Math.random() * -400;

          let colorClass = 'bg-slate-200/50 border-slate-300';
          if (item.kind === 'decision') colorClass = 'bg-emerald-200/50 border-emerald-300';
          if (item.kind === 'discovery') colorClass = 'bg-blue-200/50 border-blue-300';
          if (item.kind === 'intent') colorClass = 'bg-amber-200/50 border-amber-300';
          if (item.kind === 'question') colorClass = 'bg-rose-200/50 border-rose-300';

          return (
            <motion.div
              key={item.id}
              className={`absolute px-4 py-2 rounded-full backdrop-blur-sm border shadow-sm flex items-center gap-2 whitespace-nowrap ${colorClass}`}
              initial={{ x: startX, y: startY, z, opacity: 0 }}
              animate={{ x: endX, y: endY, z, opacity: [0, 1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 15 + Math.random() * 10, ease: 'linear' }}
            >
              <span className="font-mono text-[10px] uppercase font-bold text-slate-700/70">{item.agent || 'system'}</span>
              <span className="text-xs font-medium text-slate-800">{item.summary}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
