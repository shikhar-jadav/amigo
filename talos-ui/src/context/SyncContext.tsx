'use client';

/**
 * SyncContext
 * -----------
 * Manages the local-first snapshot sync lifecycle:
 *
 *  1. On login: checks if this machine has local data. If not, but cloud has a
 *     snapshot, triggers a restore and shows progress in the UI.
 *
 *  2. On logout: triggers a best-effort snapshot upload before the session ends.
 *
 *  3. Exposes syncState to the UI:
 *      'idle'       — nothing happening
 *      'restoring'  — downloading + extracting cloud snapshot (first login on new PC)
 *      'uploading'  — exporting snapshot to cloud (periodic or logout)
 *      'done'       — last operation completed successfully
 *      'error'      — last operation failed (message available)
 *
 *  4. Does NOT perform any per-turn sync — all memory, conversations, and
 *     workspace files remain local-only between periodic uploads.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useAuth } from '@/context/AuthContext';

export type SyncState = 'idle' | 'restoring' | 'uploading' | 'done' | 'error';

interface SyncStatus {
  syncState: SyncState;
  lastExportAt: string | null;
  errorMessage: string | null;
  cloudHasSnapshot: boolean;
  hasLocalData: boolean;
  /** Manually trigger an export (e.g. "Backup now" button) */
  triggerExport: () => Promise<void>;
}

const SyncContext = createContext<SyncStatus | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cloudHasSnapshot, setCloudHasSnapshot] = useState(false);
  const [hasLocalData, setHasLocalData] = useState(false);

  // Prevent double-triggering restore / export
  const restoreAttempted = useRef(false);

  // ── Check status on login ────────────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      // Reset on logout
      restoreAttempted.current = false;
      setSyncState('idle');
      setCloudHasSnapshot(false);
      setHasLocalData(false);
      setLastExportAt(null);
      return;
    }

    // Fresh login — check if restore is needed
    checkAndMaybeRestore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const checkAndMaybeRestore = useCallback(async () => {
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;

    try {
      const res = await fetch('/api/snapshot/status', { credentials: 'include' });
      if (!res.ok) return;
      const status = await res.json();

      setHasLocalData(status.has_local_data);
      setCloudHasSnapshot(status.cloud?.has_snapshot ?? false);
      setLastExportAt(status.last_export_at ?? null);

      // Only restore if: no local data AND cloud has a snapshot
      if (!status.has_local_data && status.cloud?.has_snapshot) {
        await triggerRestore();
      }
    } catch {
      // Non-fatal — backend may be warming up
    }
  }, []);

  // ── Restore (new PC) ─────────────────────────────────────────────────────

  const triggerRestore = useCallback(async () => {
    setSyncState('restoring');
    setErrorMessage(null);
    try {
      const res = await fetch('/api/snapshot/restore', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();

      if (data.status === 'success' || data.status === 'no_snapshot') {
        setHasLocalData(true);
        setSyncState('done');
        setLastExportAt(new Date().toISOString());
      } else {
        setSyncState('error');
        setErrorMessage(data.reason || data.error || 'Restore failed');
      }
    } catch (e: any) {
      setSyncState('error');
      setErrorMessage(e.message || 'Restore failed');
    }
  }, []);

  // ── Export (manual or periodic) ──────────────────────────────────────────

  const triggerExport = useCallback(async () => {
    if (!user) return;
    if (syncState === 'uploading' || syncState === 'restoring') return;
    setSyncState('uploading');
    setErrorMessage(null);
    try {
      const res = await fetch('/api/snapshot/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSyncState('done');
        setLastExportAt(new Date().toISOString());
        setCloudHasSnapshot(true);
      } else if (data.status === 'skipped') {
        setSyncState('idle');
      } else {
        setSyncState('error');
        setErrorMessage(data.reason || 'Export failed');
      }
    } catch (e: any) {
      setSyncState('error');
      setErrorMessage(e.message || 'Export failed');
    }
  }, [user, syncState]);

  return (
    <SyncContext.Provider
      value={{
        syncState,
        lastExportAt,
        errorMessage,
        cloudHasSnapshot,
        hasLocalData,
        triggerExport,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = (): SyncStatus => {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within a SyncProvider');
  return ctx;
};
