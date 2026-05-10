'use client';

import { useCoord } from '@/lib/store';
import { useMemo } from 'react';
import { AgentAvatar } from './AgentAvatar';
import { agentColorClass } from '@/lib/utils';

export function AgentRoster() {
  const feed = useCoord((s) => s.feed);
  const intents = useCoord((s) => s.intents);
  const discoveries = useCoord((s) => s.discoveries);

  const rosterData = useMemo(() => {
    const agents = new Map<string, { scopes: Set<string>, intents: string[], discoveries: string[] }>();
    
    // Extract from all events to get a full picture of agents and their scopes
    const processAgent = (agent: string, scope?: string) => {
      if (!agent) return;
      if (!agents.has(agent)) agents.set(agent, { scopes: new Set(), intents: [], discoveries: [] });
      if (scope) agents.get(agent)!.scopes.add(scope);
    };

    feed.forEach(f => processAgent(f.agent || '', f.scope));
    
    intents.forEach(i => {
      processAgent(i.agent, i.scope);
      if (i.agent) agents.get(i.agent)!.intents.push(i.action);
    });

    discoveries.forEach(d => {
      processAgent(d.agent, d.scope);
      if (d.agent && !d.superseded) agents.get(d.agent)!.discoveries.push(d.summary);
    });

    return Array.from(agents.entries()).map(([id, data]) => ({
      id,
      scopes: Array.from(data.scopes),
      intents: Array.from(new Set(data.intents)),
      discoveries: Array.from(new Set(data.discoveries))
    })).sort((a, b) => a.id.localeCompare(b.id));
  }, [feed, intents, discoveries]);

  if (rosterData.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Waiting for agent activity...
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {rosterData.map((agent) => (
        <div key={agent.id} className="bg-surface border border-border rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
          <div className="flex items-center gap-4 mb-5">
            <div className="flex-shrink-0 w-16 h-16">
              <AgentAvatar agentId={agent.id} size={64} />
            </div>
            <div>
              <h3 className={`text-lg font-bold ${agentColorClass(agent.id)}`}>{agent.id}</h3>
              <p className="text-[11px] uppercase tracking-widest text-muted font-medium mt-0.5">Automated Agent</p>
            </div>
          </div>

          <div className="mb-4">
            <h4 className="text-[10px] uppercase tracking-wider text-muted mb-2 font-semibold">Active Scopes</h4>
            <div className="flex flex-wrap gap-2">
              {agent.scopes.length > 0 ? agent.scopes.map(s => (
                <span key={s} className="bg-bg border border-border2 rounded text-[11px] font-mono px-2 py-1 text-text">
                  {s}
                </span>
              )) : <span className="text-xs text-muted">None</span>}
            </div>
          </div>

          <div className="mb-4">
            <h4 className="text-[10px] uppercase tracking-wider text-muted mb-1.5 font-semibold">Current Intents</h4>
            {agent.intents.length > 0 ? (
              <ul className="space-y-1.5">
                {agent.intents.map((intent, idx) => (
                  <li key={idx} className="text-sm text-text leading-tight flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">↳</span>
                    <span>{intent}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted italic">No active intents.</p>
            )}
          </div>

          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-muted mb-1.5 font-semibold">Recent Discoveries</h4>
            {agent.discoveries.length > 0 ? (
              <ul className="space-y-1.5">
                {agent.discoveries.slice(0, 3).map((disc, idx) => (
                  <li key={idx} className="text-xs text-text leading-snug flex items-start gap-2">
                    <span className="text-emerald-500">✓</span>
                    <span className="line-clamp-2">{disc}</span>
                  </li>
                ))}
                {agent.discoveries.length > 3 && (
                  <li className="text-[10px] text-muted italic ml-4">+{agent.discoveries.length - 3} more</li>
                )}
              </ul>
            ) : (
              <p className="text-xs text-muted italic">No recent discoveries.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
