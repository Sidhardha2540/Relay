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

export function agentColor(agent: string | null | undefined): string {
  switch (agent) {
    case 'claude-code':
    case 'claude':       return 'text-claude';
    case 'cursor':       return 'text-cursor';
    case 'aider':        return 'text-aider';
    case 'human':        return 'text-human';
    default:             return 'text-muted';
  }
}
