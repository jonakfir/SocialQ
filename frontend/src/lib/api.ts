import { env as PUBLIC } from '$env/dynamic/public';

const ABS_BASE = (PUBLIC.PUBLIC_API_URL || '').replace(/\/$/, '');
const buildURL = (p: string) => (ABS_BASE ? `${ABS_BASE}${p}` : `/api${p}`);
export async function apiFetch(path: string, init: RequestInit = {}) {
  const url = buildURL(path);
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('content-type') && init.body && typeof init.body === 'string') {
    headers.set('content-type', 'application/json');
  }
  return fetch(url, { ...init, headers, credentials: 'include' });
}