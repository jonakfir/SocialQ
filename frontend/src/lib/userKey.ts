// ID-only, stable across username changes
export function getUserId(): number | null {
  try {
    const id = Number(localStorage.getItem('userId'));
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function userKey(): string {
  const id = getUserId();
  return id ? `u${id}` : 'anon';
}

// Canonical keys
export function frKey(): string { return `fr_history_${userKey()}`; }
export function trKey(): string { return `tr_history_${userKey()}`; }

// One-time migration: copy from any old name-based keys to the stable ID key.
// Safe: never deletes, and skips if target already exists.
export function migrateHistoryKeys() {
  const id = getUserId();
  if (!id) return;

  const stableFR = `fr_history_u${id}`;
  if (localStorage.getItem(stableFR)) return; // already migrated/exists

  const name = (localStorage.getItem('username') || '').trim().toLowerCase();
  const candidates = [
    `fr_history_${name}`,           // very old
    `fr_history_name:${name}`,      // old variant
    `fr_history_id:${id}:${name}`,  // id+name combined
  ];

  for (const k of candidates) {
    if (!k) continue;
    const v = localStorage.getItem(k);
    if (v) {                        // copy, don't remove originals
      localStorage.setItem(stableFR, v);
      break;
    }
  }
}
