import React from 'react';
import { agentHexColor, agentStyle } from '@/lib/utils';

export function AgentAvatar({ agentId, size = 80 }: { agentId: string; size?: number }) {
  const c = agentHexColor(agentId);
  const bg = c + '1A'; // 10% opacity hex
  const style = agentStyle(agentId);

  let faceDetails = null;

  if (style === 'nerd') {
    faceDetails = (
      <>
        <circle cx="30" cy="38" r="4" fill={c} />
        <circle cx="50" cy="38" r="4" fill={c} />
        <rect x="22" y="30" width="16" height="16" rx="4" fill="none" stroke={c} strokeWidth="3" />
        <rect x="42" y="30" width="16" height="16" rx="4" fill="none" stroke={c} strokeWidth="3" />
        <line x1="38" y1="38" x2="42" y2="38" stroke={c} strokeWidth="3" />
        <path d="M 32 52 Q 40 56 48 52" stroke={c} strokeWidth="2" fill="none" />
        <rect x="38" y="53" width="4" height="5" fill="white" stroke={c} strokeWidth="1" />
      </>
    );
  } else if (style === 'visor') {
    faceDetails = (
      <>
        <rect x="20" y="32" width="40" height="12" rx="6" fill={c} />
        <rect x="24" y="35" width="12" height="6" rx="3" fill="white" opacity="0.8" />
        <path d="M 45 52 Q 48 50 50 50" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    );
  } else if (style === 'mustache') {
    faceDetails = (
      <>
        <circle cx="50" cy="36" r="8" fill="none" stroke={c} strokeWidth="2" />
        <line x1="56" y1="42" x2="62" y2="52" stroke={c} strokeWidth="1.5" />
        <circle cx="30" cy="36" r="3" fill={c} />
        <path d="M 26 48 Q 40 40 54 48 Q 40 52 26 48 Z" fill={c} />
      </>
    );
  } else if (style === 'coffee') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="40" r="36" fill={bg} />
        <circle cx="40" cy="40" r="34" fill="none" stroke={c} strokeWidth="2" />
        <circle cx="40" cy="32" r="14" fill={c} />
        <path d="M 20 66 C 20 50, 60 50, 60 66" fill={c} />
        <g transform="translate(50, 48)">
          <rect x="0" y="0" width="12" height="14" rx="2" fill="white" stroke={c} strokeWidth="2" />
          <path d="M 12 4 C 16 4, 16 10, 12 10" fill="none" stroke={c} strokeWidth="2" />
          <path d="M 4 -4 Q 2 -8 4 -12" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 8 -2 Q 10 -6 8 -10" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </svg>
    );
  }

  // Base Robot SVG
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="36" fill={bg} />
      <rect x="16" y="20" width="48" height="44" rx="12" fill="white" stroke={c} strokeWidth="3" />
      <line x1="40" y1="20" x2="40" y2="8" stroke={c} strokeWidth="3" />
      <circle cx="40" cy="8" r="4" fill={c} />
      <rect x="10" y="34" width="6" height="16" rx="3" fill={c} />
      <rect x="64" y="34" width="6" height="16" rx="3" fill={c} />
      {faceDetails}
    </svg>
  );
}
