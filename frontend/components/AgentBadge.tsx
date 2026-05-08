import { cn, agentColor } from '@/lib/utils';

export function AgentBadge({ agent, className }: { agent: string | null; className?: string }) {
  if (!agent) {
    return <span className={cn('text-muted text-xs font-mono', className)}>—</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-mono',
        agentColor(agent),
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {agent}
    </span>
  );
}
