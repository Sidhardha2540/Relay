'use client';

import { timeUntil } from '@/lib/utils';
import { useEffect, useState } from 'react';

export function TTLCountdown({ expiresAt }: { expiresAt: string }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const left = timeUntil(expiresAt);
  const urgent =
    left !== 'expired' &&
    new Date(expiresAt).getTime() - Date.now() < 120_000;

  void tick;

  return (
    <span
      className={`font-mono text-[10px] font-semibold ${urgent ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-300'}`}
    >
      ⏱ {left === 'expired' ? 'expired' : `${left} left`}
    </span>
  );
}
