'use client';

import React from 'react';
import { Cloud, RefreshCw, AlertCircle, Download, CheckCircle } from 'lucide-react';
import { useSync, SyncState } from '@/context/SyncContext';

/**
 * SyncIndicator
 * -------------
 * Small badge shown in the sidebar header.
 *
 * States:
 *   idle        — no recent activity (hidden or neutral)
 *   restoring   — downloading + extracting cloud snapshot on new PC
 *   uploading   — exporting snapshot to cloud (periodic or logout)
 *   done        — last operation succeeded
 *   error       — last operation failed
 */

interface SyncIndicatorProps {
  /** Override state for stories / testing */
  overrideState?: SyncState;
  onRetry?: () => void;
}

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({ overrideState, onRetry }) => {
  const { syncState: ctxState, lastExportAt, errorMessage, triggerExport } = useSync();
  const state = overrideState ?? ctxState;

  if (state === 'idle') return null;

  const handleRetry = onRetry ?? triggerExport;

  // Format relative time
  const relativeTime = (iso: string | null): string => {
    if (!iso) return '';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border"
      title={
        state === 'restoring'
          ? 'Downloading your data from cloud backup…'
          : state === 'uploading'
          ? 'Uploading backup to cloud…'
          : state === 'done'
          ? `Backup saved ${relativeTime(lastExportAt)}`
          : errorMessage || 'Sync error'
      }
    >
      {state === 'restoring' && (
        <>
          <Download className="w-2.5 h-2.5 text-sky-400 animate-bounce" />
          <span className="text-sky-300">Restoring…</span>
        </>
      )}

      {state === 'uploading' && (
        <>
          <RefreshCw className="w-2.5 h-2.5 text-amber-400 animate-spin" />
          <span className="text-amber-300">Backing up…</span>
        </>
      )}

      {state === 'done' && (
        <>
          <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
          <span className="text-emerald-300">
            Backed up{lastExportAt ? ` ${relativeTime(lastExportAt)}` : ''}
          </span>
        </>
      )}

      {state === 'error' && (
        <>
          <AlertCircle className="w-2.5 h-2.5 text-rose-400" />
          <span className="text-rose-300">Backup failed</span>
          <button
            onClick={handleRetry}
            className="ml-1 underline hover:text-white transition-colors text-rose-300"
          >
            Retry
          </button>
        </>
      )}
    </span>
  );
};

export type { SyncState };
