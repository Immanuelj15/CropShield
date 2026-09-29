import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  getPendingCount,
  getFailedActions,
  flushOfflineQueue,
  subscribeQueueChanges,
  discardAction,
  retryFailedAction,
  describeAction,
} from '../utils/offlineQueue';
import { API_PREFIX } from '../utils/http';

const HEALTH_URL = `${API_PREFIX}/health`;

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedItems, setFailedItems] = useState([]);
  const [showFailed, setShowFailed] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncStr, setLastSyncStr] = useState('');
  const [syncSuccessMsg, setSyncSuccessMsg] = useState('');

  const refreshFailed = useCallback(async () => {
    setFailedItems(await getFailedActions());
  }, []);

  // Ping the canonical backend health check (contract 13) to confirm real connectivity
  const checkConnectivity = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(HEALTH_URL, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      setIsOnline(res.ok);
    } catch (e) {
      setIsOnline(false);
    }
  }, []);

  useEffect(() => {
    getPendingCount().then(setPendingCount);
    refreshFailed();

    const unsub = subscribeQueueChanges((count) => {
      setPendingCount(count);
      refreshFailed();
    });

    const last = localStorage.getItem('agriguard_last_sync_time');
    if (last) {
      const d = new Date(last);
      setLastSyncStr(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }

    // NOTE: the queue flush on `online` is owned by utils/offlineQueue.js (single listener).
    const handleOnline = () => { checkConnectivity(); };
    const handleOffline = () => setIsOnline(false);
    const handleAuth = () => {
      getPendingCount().then(setPendingCount);
      refreshFailed();
      // Replay anything this user queued earlier (shared, locked flush; no-op when logged out)
      if (navigator.onLine) flushOfflineQueue();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('cropshield_auth_changed', handleAuth);

    checkConnectivity();
    if (navigator.onLine) flushOfflineQueue();
    const interval = setInterval(checkConnectivity, 25000);

    return () => {
      unsub();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('cropshield_auth_changed', handleAuth);
      clearInterval(interval);
    };
  }, [checkConnectivity, refreshFailed]);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncSuccessMsg('');
    try {
      // Shared, locked flush — safe even if the `online` listener already started one.
      const result = await flushOfflineQueue({ force: true });
      if (result.processed > 0) {
        setSyncSuccessMsg(`Synced ${result.processed} pending item${result.processed > 1 ? 's' : ''}`);
        setTimeout(() => setSyncSuccessMsg(''), 4000);
        const now = new Date();
        localStorage.setItem('agriguard_last_sync_time', now.toISOString());
        setLastSyncStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
      await refreshFailed();
    } catch (err) {
      console.error('Manual sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDiscard = async (id) => {
    await discardAction(id);
    await refreshFailed();
  };

  const handleRetry = async (id) => {
    setIsSyncing(true);
    try {
      await retryFailedAction(id);
    } finally {
      await refreshFailed();
      setIsSyncing(false);
    }
  };

  const failedCount = failedItems.length;

  // If online and nothing pending/failed and no success message, keep navbar clean
  if (isOnline && pendingCount === 0 && failedCount === 0 && !syncSuccessMsg) {
    return null;
  }

  return (
    <aside
      aria-label="Offline and sync status"
      className={`w-full text-xs sm:text-sm font-medium z-50 shadow-sm ${
        !isOnline
          ? 'bg-amber-500/90 text-amber-950 border-b border-amber-600/30'
          : syncSuccessMsg
          ? 'bg-emerald-600 text-white border-b border-emerald-700'
          : failedCount > 0 && pendingCount === 0
          ? 'bg-red-50 text-red-900 border-b border-red-200'
          : 'bg-emerald-800 text-emerald-100 border-b border-emerald-700'
      }`}
    >
      <div className="px-4 py-2 flex items-center justify-between transition-all duration-300">
        <div className="flex items-center gap-2 max-w-3xl overflow-hidden flex-wrap">
          {!isOnline ? (
            <>
              <WifiOff className="w-4 h-4 shrink-0 text-amber-950 animate-pulse" />
              <span className="truncate">
                <strong>Offline Mode:</strong> Showing cached data{lastSyncStr ? ` from ${lastSyncStr}` : ''} — reconnecting to field network...
              </span>
            </>
          ) : syncSuccessMsg ? (
            <>
              <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />
              <span>{syncSuccessMsg}</span>
            </>
          ) : pendingCount > 0 ? (
            <>
              <Wifi className="w-4 h-4 shrink-0 text-emerald-300" />
              <span>Connected online. Ready to sync pending items.</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>Some offline entries were rejected by the server and were not saved.</span>
            </>
          )}

          {pendingCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-900/20 font-semibold text-[11px]">
              <AlertTriangle className="w-3 h-3 inline" />
              {pendingCount} offline {pendingCount === 1 ? 'item' : 'items'} queued
            </span>
          )}
          {failedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowFailed((v) => !v)}
              className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white font-semibold text-[11px]"
              aria-expanded={showFailed}
            >
              {failedCount} failed — review
              {showFailed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {pendingCount > 0 && isOnline && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-white text-emerald-900 hover:bg-emerald-50 text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>
      </div>

      {showFailed && failedCount > 0 && (
        <ul className="px-4 pb-3 space-y-1.5 bg-white text-stone-800 border-t border-red-200">
          {failedItems.map((item) => (
            <li key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 text-xs">
              <div className="min-w-0">
                <span className="font-bold">{describeAction(item)}</span>
                <span className="text-stone-500"> · queued {new Date(item.queued_at).toLocaleString()}</span>
                <p className="text-red-700 break-words">{item.last_error || 'Rejected by server'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleRetry(item.id)}
                  disabled={isSyncing || !isOnline}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-stone-300 hover:bg-stone-50 font-semibold disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
                <button
                  type="button"
                  onClick={() => handleDiscard(item.id)}
                  disabled={isSyncing}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 font-semibold disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" /> Discard
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
