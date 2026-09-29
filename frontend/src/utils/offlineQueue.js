/**
 * IndexedDB-backed Offline Action Queue & Sync Manager for AgriGuard.
 * Stores treatment logs, expense/revenue entries and compressed leaf photo uploads
 * when offline, and flushes them automatically when connectivity returns.
 *
 * Replay rules (audit P2-1 / P2-2):
 *  - An item is removed ONLY when the server answers 2xx.
 *  - 4xx (except 408/429) -> item is marked `failed` and kept so the user can see it
 *    (OfflineBanner lists failed items with Retry / Discard).
 *  - 5xx / 408 / 429 / network errors -> item stays `pending` and is retried with backoff.
 *  - A single module-level promise locks the flush; there is exactly one `online` listener.
 *  - Items are tagged with the user who queued them and only replayed with that user's token.
 */

import { apiFetch, ApiError, getToken, getUserCacheId } from './http';

const DB_NAME = 'AgriGuardOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'action_queue';

let dbInstance = null;
const listeners = new Set();

export function subscribeQueueChanges(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners(count, failedCount = 0) {
  listeners.forEach(cb => {
    try { cb(count, failedCount); } catch (e) { console.error('Queue listener error:', e); }
  });
}

async function notifyAll() {
  const [pending, failed] = await Promise.all([getPendingCount(), getFailedCount()]);
  notifyListeners(pending, failed);
}

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('queued_at', 'queued_at', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Compress an image file/blob client-side before offline queueing
 */
export async function compressImage(file, maxDimension = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/**
 * Queue an action into IndexedDB (supports both {type, payload} and (type, payload))
 */
export async function queueOfflineAction(arg1, arg2) {
  let type, payload;
  if (typeof arg1 === 'object' && arg1 !== null && 'type' in arg1) {
    type = arg1.type;
    payload = arg1.payload;
  } else {
    type = arg1;
    payload = arg2;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record = {
      type,
      payload,
      owner: getUserCacheId(),
      queued_at: Date.now(),
      status: 'pending',
      attempts: 0,
      next_attempt_at: 0,
      last_error: null,
    };

    const req = store.add(record);
    req.onsuccess = async () => {
      await notifyAll();
      registerBackgroundSync('sync-offline-actions');
      resolve({ id: req.result, queued: true });
    };

    req.onerror = () => reject(req.error);
  });
}

async function getAllRecords() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return [];
  }
}

// Only the signed-in user's items are visible/replayable (legacy items without owner are shown too).
function belongsToCurrentUser(item) {
  const me = getUserCacheId();
  return !item.owner || (me && item.owner === me);
}

/**
 * Retrieve the current user's pending (not failed) items
 */
export async function getPendingActions() {
  const all = await getAllRecords();
  return all.filter(i => i.status !== 'failed' && belongsToCurrentUser(i));
}

/**
 * Retrieve the current user's items that the server rejected (4xx) and need attention
 */
export async function getFailedActions() {
  const all = await getAllRecords();
  return all.filter(i => i.status === 'failed' && belongsToCurrentUser(i));
}

/**
 * Count items pending in the queue (excludes failed items)
 */
export async function getPendingCount() {
  return (await getPendingActions()).length;
}

export async function getFailedCount() {
  return (await getFailedActions()).length;
}

async function putRecord(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(record);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete an item from the queue (after a successful sync, or when the user discards it)
 */
export async function removeAction(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = async () => {
      await notifyAll();
      resolve(true);
    };
    req.onerror = () => reject(req.error);
  });
}

/** User chose to drop a failed item. */
export const discardAction = removeAction;

/** User chose to retry a failed item: move it back to pending and flush. */
export async function retryFailedAction(id) {
  const all = await getAllRecords();
  const item = all.find(i => i.id === id);
  if (!item) return null;
  await putRecord({ ...item, status: 'pending', attempts: 0, next_attempt_at: 0, last_error: null });
  await notifyAll();
  return flushOfflineQueue({ force: true });
}

/**
 * Attempt to register Background Sync with ServiceWorker
 */
export function registerBackgroundSync(tag = 'sync-offline-actions') {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready
      .then((reg) => reg.sync.register(tag))
      .catch((err) => console.log('Background Sync not supported or failed:', err));
  }
}

/** Human readable label for an item (used by OfflineBanner / settings). */
export function describeAction(item) {
  switch (item?.type) {
    case 'treatment_log': return 'Treatment log';
    case 'leaf_photo': return 'Leaf photo scan';
    case 'expense_log': return 'Expense entry';
    case 'revenue_log': return 'Revenue entry';
    default: return item?.type || 'Queued item';
  }
}

function sendAction(item) {
  const payload = item.payload || {};
  switch (item.type) {
    case 'treatment_log':
      return apiFetch('/treatments', { method: 'POST', json: payload });
    case 'expense_log':
      return apiFetch('/expenses', { method: 'POST', json: payload });
    case 'revenue_log':
      return apiFetch('/revenue', { method: 'POST', json: payload });
    case 'leaf_photo': {
      const formData = new FormData();
      if (payload.blob) formData.append('file', payload.blob, payload.filename || 'leaf.jpg');
      if (payload.farm_id) formData.append('farm_id', payload.farm_id);
      if (payload.crop_hint) formData.append('crop_hint', payload.crop_hint);
      return apiFetch('/disease/detect', { method: 'POST', body: formData });
    }
    default:
      return Promise.reject(new ApiError(`Unknown queued action type: ${item.type}`, { status: 400 }));
  }
}

const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 10 * 60 * 1000;

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

let flushPromise = null;
let retryTimer = null;

function scheduleRetry(records) {
  if (typeof window === 'undefined') return;
  const next = records
    .filter(r => r.status !== 'failed' && r.next_attempt_at)
    .map(r => r.next_attempt_at)
    .sort((a, b) => a - b)[0];
  if (!next) return;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    flushOfflineQueue();
  }, Math.max(1000, next - Date.now()));
}

async function doFlush({ force = false } = {}) {
  // Never replay without a login: the items would be rejected (or attributed to nobody).
  if (!getToken()) return { processed: 0, failed: 0, retrying: 0, remaining: await getPendingCount() };

  const actions = await getPendingActions();
  if (!actions.length) {
    await notifyAll();
    return { processed: 0, failed: 0, retrying: 0, remaining: 0 };
  }

  let processed = 0;
  let failed = 0;
  let retrying = 0;
  const now = Date.now();
  const deferred = [];

  for (let idx = 0; idx < actions.length; idx++) {
    const item = actions[idx];
    if (!force && item.next_attempt_at && item.next_attempt_at > now) {
      deferred.push(item);
      continue;
    }
    try {
      await sendAction(item);
      await removeAction(item.id);
      processed++;
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const network = !(err instanceof ApiError) || err.isNetwork;
      if (network || status === 401 || isRetryableStatus(status)) {
        // Keep & retry later with exponential backoff (never drop on 5xx / offline)
        const attempts = (item.attempts || 0) + 1;
        const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempts - 1));
        const updated = {
          ...item,
          attempts,
          next_attempt_at: Date.now() + delay,
          last_error: err?.message || 'Temporary failure',
        };
        await putRecord(updated);
        deferred.push(updated);
        retrying++;
        // Offline or session expired: no point hammering the rest now.
        if (network || status === 401) {
          deferred.push(...actions.slice(idx + 1));
          break;
        }
      } else {
        // Permanent rejection (validation / permission / not found): keep it and surface to the user.
        await putRecord({
          ...item,
          status: 'failed',
          failed_at: Date.now(),
          last_error: err?.message || `Rejected by server (${status})`,
        });
        failed++;
      }
    }
  }

  await notifyAll();
  scheduleRetry(deferred);
  const remaining = await getPendingCount();
  return { processed, failed, retrying, remaining };
}

/**
 * Flush all queued offline actions. Concurrent calls share one in-flight flush (module-level lock).
 * @param {{force?: boolean}} opts force=true ignores backoff timers (manual "Sync now").
 */
export function flushOfflineQueue(opts = {}) {
  if (flushPromise) return flushPromise;
  flushPromise = doFlush(opts)
    .catch((err) => {
      console.warn('Offline queue flush failed:', err);
      return { processed: 0, failed: 0, retrying: 0, remaining: 0, error: err };
    })
    .finally(() => {
      flushPromise = null;
    });
  return flushPromise;
}

// Single auto-flush listener for the whole app (OfflineBanner does NOT add another one).
if (typeof window !== 'undefined' && !window.__agriguardOfflineListener) {
  window.__agriguardOfflineListener = true;
  window.addEventListener('online', () => {
    console.log('AgriGuard back online - syncing queued actions...');
    flushOfflineQueue();
  });
  // Background Sync from the service worker (src/sw.js) asks the page to flush (shared lock).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'FLUSH_OFFLINE_QUEUE') flushOfflineQueue();
    });
  }
}
