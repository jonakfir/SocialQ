/**
 * Daily free play tracking (per user, per day) – matches iOS DailyFreePlayTracking.
 * Key: daily_free_played_YYYY-MM-DD_userId, value: JSON array of game ids.
 */

export type DailyGameId = 'facial_recognition' | 'transition_recognition' | 'emotion_training' | 'mirroring';

const STORAGE_KEY_PREFIX = 'daily_free_played_';
const PENDING_KEY = 'daily_free_play_pending_game';

export function getTodayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getUserIdForDaily(): string {
  if (typeof window === 'undefined') return 'anon';
  const email = (localStorage.getItem('email') || '').trim().toLowerCase();
  const id = localStorage.getItem('userId') || '';
  if (email) return email;
  if (id) return `user_${id}`;
  return 'anon';
}

function storageKey(date: string, userId: string): string {
  return `${STORAGE_KEY_PREFIX}${date}_${userId}`;
}

export function hasPlayed(date: string, userId: string, game: DailyGameId): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = storageKey(date, userId);
    const raw = localStorage.getItem(key);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    return arr.includes(game);
  } catch {
    return false;
  }
}

export function markPlayed(date: string, userId: string, game: DailyGameId): void {
  if (typeof window === 'undefined') return;
  try {
    const key = storageKey(date, userId);
    const raw = localStorage.getItem(key);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    if (!arr.includes(game)) {
      arr.push(game);
      localStorage.setItem(key, JSON.stringify(arr));
    }
  } catch {}
}

/** Set when user clicks Play on daily page; results pages call getAndClearPendingGame and markPlayed. */
export function setPendingGame(game: DailyGameId): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_KEY, game);
  } catch {}
}

/** Returns the game id if user came from daily free play and clears it. Call from results/completion. */
export function getAndClearPendingGame(): DailyGameId | null {
  if (typeof window === 'undefined') return null;
  try {
    const g = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    if (g && ['facial_recognition', 'transition_recognition', 'emotion_training', 'mirroring'].includes(g))
      return g as DailyGameId;
    return null;
  } catch {
    return null;
  }
}

/** Call from a results/completion page to mark the current game as played if user came from daily. */
export function markPlayedIfPending(): void {
  const game = getAndClearPendingGame();
  if (!game) return;
  const date = getTodayDate();
  const userId = getUserIdForDaily();
  markPlayed(date, userId, game);
}
