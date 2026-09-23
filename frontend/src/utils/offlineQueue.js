/**
 * IndexedDB-backed Offline Action Queue & Sync Manager for AgriGuard.
 * Stores treatment logs and compressed leaf photo uploads when offline,
 * and flushes them automatically when connectivity returns.
 */

const DB_NAME = 'AgriGuardOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'action_queue';

let dbInstance = null;
const listeners = new Set();

export function subscribeQueueChanges(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners(count) {
  listeners.forEach(cb => {
    try { cb(count); } catch (e) { console.error('Queue listener error:', e); }
  });
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
 * Queue an action into IndexedDB
 */
export async function queueOfflineAction({ type, payload }) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record = {
      type,
      payload,
      queued_at: Date.now(),
      status: 'pending',
    };

    const req = store.add(record);
    req.onsuccess = async () => {
      const count = await getPendingCount();
      notifyListeners(count);
      registerBackgroundSync('sync-offline-actions');
      resolve({ id: req.result, queued: true });
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Count items pending in the queue
 */
export async function getPendingCount() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch (e) {
    return 0;
  }
}

/**
 * Retrieve all pending items
 */
export async function getPendingActions() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
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

/**
 * Delete a processed item from the queue
 */
export async function removeAction(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = async () => {
      const count = await getPendingCount();
      notifyListeners(count);
      resolve(true);
    };
    req.onerror = () => reject(req.error);
  });
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

/**
 * Flush all queued offline actions
 */
export async function flushOfflineQueue(apiClient) {
  const actions = await getPendingActions();
  if (!actions.length) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  for (const item of actions) {
    try {
      if (item.type === 'treatment_log') {
        if (apiClient && apiClient.post) {
          await apiClient.post('/treatments', item.payload);
        } else {
          await fetch('/api/v1/treatments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
          });
        }
      } else if (item.type === 'leaf_photo') {
        const formData = new FormData();
        if (item.payload.blob) {
          formData.append('file', item.payload.blob, item.payload.filename || 'leaf.jpg');
        }
        if (item.payload.farm_id) {
          formData.append('farm_id', item.payload.farm_id);
        }

        await fetch('/api/v1/diagnose-leaf', {
          method: 'POST',
          body: formData,
        });
      }

      await removeAction(item.id);
      processed++;
    } catch (err) {
      console.warn('Failed to sync offline action:', item, err);
      failed++;
    }
  }

  const remaining = await getPendingCount();
  notifyListeners(remaining);
  return { processed, failed, remaining };
}

// Auto-flush when browser goes online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('AgriGuard back online - syncing queued actions...');
    flushOfflineQueue();
  });
}
