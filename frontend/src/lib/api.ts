import { browser } from '$app/environment';
import { PUBLIC_API_URL } from '$env/static/public';

// ALWAYS have a safe fallback to /api, even if the env var is missing
const BASE = (PUBLIC_API_URL?.trim() || '/api').replace(/\/$/, '');

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('content-type') && init.body && typeof init.body === 'string') {
    headers.set('content-type', 'application/json');
  }

  // Browser: `${BASE}${path}` -> '/api/...' when env is empty
  // Server:  force '/api/...' so SSR also uses the proxy
  const url = browser ? `${BASE}${path}` : `/api${path}`;
  return fetch(url, { ...init, headers, credentials: 'include' });
}