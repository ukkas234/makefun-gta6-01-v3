// save.js — Solmara (gta6-01)
// Save-game persistence on top of localStorage.
// Plain ES module, no build step, no network requests.
//
// Contract: loadSave() / saveSave(data) / clearSave(),
// localStorage key "solmara-save-v1".
// Works even where localStorage is unavailable (private mode, file://):
// falls back to an in-memory slot for the session.

export const SAVE_KEY = 'solmara-save-v1';
export const SAVE_VERSION = 1;

let memorySlot = null;
let storageOK = null;

function storageAvailable() {
  if (storageOK !== null) return storageOK;
  try {
    const probe = '__solmara_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    storageOK = true;
  } catch (_err) {
    storageOK = false;
  }
  return storageOK;
}

// loadSave() -> saved data object, or null when there is no save
// (or the stored save is corrupt / from another version).
export function loadSave() {
  let raw = null;
  try {
    raw = storageAvailable() ? window.localStorage.getItem(SAVE_KEY) : memorySlot;
  } catch (_err) {
    raw = memorySlot;
  }
  if (raw === null || raw === undefined) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.version !== SAVE_VERSION) return null;
    return data;
  } catch (_err) {
    return null;
  }
}

// saveSave(data) -> true on success, false when the data cannot be stored
// (quota, unavailable storage, or unserializable data). Never throws.
export function saveSave(data) {
  if (!data || typeof data !== 'object') return false;
  let raw;
  try {
    raw = JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: Date.now() });
  } catch (_err) {
    return false;
  }
  memorySlot = raw;
  if (!storageAvailable()) return false;
  try {
    window.localStorage.setItem(SAVE_KEY, raw);
    return true;
  } catch (_err) {
    return false;
  }
}

// clearSave() — removes the save from localStorage and the memory slot.
export function clearSave() {
  memorySlot = null;
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (_err) {
    /* already gone */
  }
}
