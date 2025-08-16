// src/lib/api.ts
import { browser } from '$app/environment';
import { PUBLIC_API_URL } from '$env/static/public';

/**
 * Backend base URL (no trailing slash).
 * Prefer PUBLIC_API_URL (set on Vercel), fall back to VITE_API_BASE for local/dev.
 */
const BASE = String(PUBLIC_API_URL || import.meta.env.VITE_API_BASE || '')
  .replace(/\/$/, '');

// Helpful warning if you forgot to configure the env var in production.
if (browser && import.meta.env.PROD && !BASE) {
  // eslint-disable-next-line no-console
  console.warn(
    '[api] PUBLIC_API_URL (or VITE_API_BASE) is not set — requests will go to same-origin and likely 404.'
  );
}

/** Build a full URL for an API path. Accepts with/without leading slash. */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  // If BASE is empty, we hit same-origin (useful in local dev if you proxy).
  return BASE ? `${BASE}${p}` : p;
}

/** Low-level fetch with sane defaults for our API. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  // If body is a string and no content-type set, default to JSON.
  if (!headers.has('content-type') && init.body && typeof init.body === 'string') {
    headers.set('content-type', 'application/json');
  }

  return fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: 'include', // send/receive cookies
  });
}

/** JSON helper that throws on non-2xx with a meaningful message. */
export async function apiJson<T = unknown>(path: string, init: RequestInit = {}) {
  const res = await apiFetch(path, init);
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore JSON parse errors; we'll still throw based on status below
  }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
    throw new Error(msg);
  }

  return data as T;
}

/** Small convenience methods */
export const api = {
  get: (p: string) => apiJson(p),
  post: (p: string, body: unknown) =>
    apiJson(p, { method: 'POST', body: JSON.stringify(body) }),
  put: (p: string, body: unknown) =>
    apiJson(p, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (p: string, body: unknown) =>
    apiJson(p, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (p: string, body?: unknown) =>
    apiJson(p, {
      method: 'DELETE',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
};
