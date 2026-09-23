import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getPendingCount, flushOfflineQueue, subscribeQueueChanges } from '../utils/offlineQueue';

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncStr, setLastSyncStr] = useState('');
  const [syncSuccessMsg, setSyncSuccessMsg] = useState('');

  // Ping backend to confirm real connectivity
  const checkConnectivity = async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('/health', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        setIsOnline(true);
        localStorage.setItem('agriguard_last_sync_time', new Date().toISOString());
      } else {
        setIsOnline(false);
      }
    } catch (e) {
      setIsOnline(false);
    }
  };

  useEffect(() => {
    // Initial pending count
    getPendingCount().then(setPendingCount);

    // Subscribe to queue changes
    const unsub = subscribeQueueChanges((count) => {
      setPendingCount(count);
    });

    // Check last sync time
    const last = localStorage.getItem('agriguard_last_sync_time');
    if (last) {
      const d = new Date(last);
      setLastSyncStr(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }

    const handleOnline = () => {
      checkConnectivity();
      handleSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic ping every 25 seconds
    const interval = setInterval(checkConnectivity, 25000);

    return () => {
      unsub();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncSuccessMsg('');
    try {
      const result = await flushOfflineQueue();
      if (result.processed > 0) {
        setSyncSuccessMsg(`Synced ${result.processed} pending item${result.processed > 1 ? 's' : ''}`);
        setTimeout(() => setSyncSuccessMsg(''), 4000);
      }
      const now = new Date();
      localStorage.setItem('agriguard_last_sync_time', now.toISOString());
      setLastSyncStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Manual sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // If online and no pending items and no success message, keep navbar clean
  if (isOnline && pendingCount === 0 && !syncSuccessMsg) {
    return null;
  }

  return (
    <aside
      aria-label="Offline and sync status"
      className={`w-full text-xs sm:text-sm font-medium px-4 py-2 flex items-center justify-between transition-all duration-300 z-50 shadow-sm ${
        !isOnline
          ? 'bg-amber-500/90 text-amber-950 border-b border-amber-600/30'
          : syncSuccessMsg
          ? 'bg-emerald-600 text-white border-b border-emerald-700'
          : 'bg-emerald-800 text-emerald-100 border-b border-emerald-700'
      }`}
    >
      <div className="flex items-center gap-2 max-w-3xl overflow-hidden">
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
        ) : (
          <>
            <Wifi className="w-4 h-4 shrink-0 text-emerald-300" />
            <span>Connected online. Ready to sync pending items.</span>
          </>
        )}

        {pendingCount > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-900/20 text-amber-950 font-semibold text-[11px]">
            <AlertTriangle className="w-3 h-3 inline" />
            {pendingCount} offline {pendingCount === 1 ? 'item' : 'items'} queued
          </span>
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
    </aside>
  );
}
