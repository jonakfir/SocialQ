import { browser } from '$app/environment';
import { PUBLIC_API_URL } from '$env/static/public';

const BASE = (PUBLIC_API_URL || '').replace(/\/$/, '');

export async function apiFetch(path: string, init: RequestInit = {}) {
  const url = browser ? `${BASE}${path}` : `/api${path}`;
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('content-type') && init.body && typeof init.body === 'string') {
    headers.set('content-type', 'application/json');
  }
  return fetch(url, { ...init, headers, credentials: 'include' });
}