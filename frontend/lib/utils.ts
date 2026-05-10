import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "2m 14s ago" — used in feed timestamps and intent TTLs. */
export function timeAgo(iso: string, from: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor((from - then) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s ago` : `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

/** "in 4m 30s" — for intent expires_at countdown. */
export function timeUntil(iso: string, from: number = Date.now()): string {
  const ms = new Date(iso).getTime() - from;
  if (ms <= 0) return 'expired';
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

const AGENT_COLORS = {
  'claude-code': '#6366F1', // indigo
  'claude': '#6366F1',
  'cursor': '#14B8A6', // teal
  'aider': '#059669', // emerald
  'human': '#F43F5E', // rose
  'antigravity': '#06B6D4', // cyan
};

const AGENT_STYLES = {
  'claude-code': 'nerd',
  'claude': 'nerd',
  'cursor': 'visor',
  'aider': 'mustache',
  'antigravity': 'mustache',
  'human': 'coffee',
};

export function agentColorClass(agent: string | null | undefined): string {
  if (!agent) return 'text-muted';
  if (agent in AGENT_COLORS) return `text-${agent}`;
  return 'text-indigo-500'; // fallback
}

export function agentHexColor(agent: string | null | undefined): string {
  if (!agent) return '#8A837A'; // muted
  const key = Object.keys(AGENT_COLORS).find(k => agent.toLowerCase().includes(k));
  if (key) return AGENT_COLORS[key as keyof typeof AGENT_COLORS];
  
  // deterministic hex from string
  let hash = 0;
  for (let i = 0; i < agent.length; i++) {
    hash = agent.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = Math.floor(Math.abs((Math.sin(hash) * 10000) % 1 * 16777215)).toString(16);
  return '#' + color.padStart(6, '0');
}

export function agentStyle(agent: string | null | undefined): 'nerd' | 'visor' | 'mustache' | 'coffee' | 'robot' {
  if (!agent) return 'robot';
  const key = Object.keys(AGENT_STYLES).find(k => agent.toLowerCase().includes(k));
  if (key) return AGENT_STYLES[key as keyof typeof AGENT_STYLES] as any;
  return 'robot';
}
