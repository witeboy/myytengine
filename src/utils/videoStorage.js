const DB_NAME = 'yt_engine_exports';
const STORE   = 'videos';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveExportedVideo(projectId, blob, filename) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(
        { blob, filename, size: blob.size, timestamp: Date.now() },
        projectId
      );
      tx.oncomplete = () => { console.log('[VideoStorage] Saved', filename, (blob.size / 1048576).toFixed(1), 'MB'); resolve(true); };
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[VideoStorage] Save failed:', e.message);
    return false;
  }
}

export async function loadExportedVideo(projectId) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(projectId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[VideoStorage] Load failed:', e.message);
    return null;
  }
}

export async function deleteExportedVideo(projectId) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(projectId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return false;
  }
}
