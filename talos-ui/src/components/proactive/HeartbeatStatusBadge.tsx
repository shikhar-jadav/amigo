'use client';

import React from 'react';
import { useProactive } from '@/context/ProactiveContext';

export const HeartbeatStatusBadge: React.FC = () => {
  const { heartbeatStatus } = useProactive();

  const isOk = heartbeatStatus === 'ok';
  const isAlert = heartbeatStatus === 'alert';

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors select-none ${
        isAlert
          ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
          : isOk
          ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400'
          : 'bg-neutral-900 border-neutral-800 text-neutral-400'
      }`}
      title={
        isAlert
          ? 'Active incident detected by background watcher'
          : 'Global Singleton Heartbeat Active • Deterministic sweeps passing silently'
      }
    >
      <span className="relative flex h-2 w-2">
        {isOk && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isAlert ? 'bg-amber-400' : isOk ? 'bg-emerald-500' : 'bg-neutral-500'
          }`}
        />
      </span>
      <span>Heartbeat: {isAlert ? 'Alert' : isOk ? 'OK' : 'Standby'}</span>
    </div>
  );
};
