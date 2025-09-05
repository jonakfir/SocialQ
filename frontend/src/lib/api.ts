// src/lib/api.ts
import { env as PUBLIC } from '$env/dynamic/public';
import { dev } from '$app/environment';

const ABS_BASE = (PUBLIC.PUBLIC_API_URL || '').replace(/\/$/, '');
const buildURL = (p: string) => (ABS_BASE ? `${ABS_BASE}${p}` : `/api${p}`);

// -----------------------
// Localhost auth mock
// -----------------------
const LS_KEY = 'mock_auth_user';

function isLocalMock(): boolean {
  // Only mock in dev and when running on a localhost-ish host
  if (!dev) return false;
  try {
    const h =
      typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local');
  } catch {
    return dev;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

async function readJson(body: any): Promise<any> {
  if (!body) return null;
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return null; }
  }
  if (body instanceof FormData) {
    const o: Record<string, any> = {};
    body.forEach((v, k) => (o[k] = v));
    return o;
  }
  try { return JSON.parse(String(body)); } catch { return null; }
}

// -----------------------
// Public fetch helper
// -----------------------
export async function apiFetch(path: string, init: RequestInit = {}) {
  // If not mocking, forward to real backend (keeps your PUBLIC_API_URL behavior)
  const shouldMock = isLocalMock() && path.startsWith('/auth/');
  if (!shouldMock) {
    const url = buildURL(path);
    const headers = new Headers(init.headers ?? {});
    if (!headers.has('content-type') && init.body && typeof init.body === 'string') {
      headers.set('content-type', 'application/json');
    }
    return fetch(url, { ...init, headers, credentials: 'include' });
  }

  // -----------------------
  // Mocked /auth/* endpoints (dev/localhost only)
  // -----------------------
  const readUser = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
  };
  const writeUser = (u: any) => localStorage.setItem(LS_KEY, JSON.stringify(u));
  const clearUser = () => localStorage.removeItem(LS_KEY);

  const method = (init.method || 'GET').toUpperCase();

  if (path === '/auth/login' && method === 'POST') {
    const body = await readJson(init.body);
    const email = String(body?.email || 'local@example.com').trim().toLowerCase();
    const user = { id: 1, email };
    writeUser(user);
    return json({ ok: true, user });
  }

  if (path === '/auth/register' && method === 'POST') {
    const body = await readJson(init.body);
    const email = String(body?.email || 'local@example.com').trim().toLowerCase();
    const user = { id: 1, email };
    writeUser(user);
    return json({ ok: true, user });
  }

  if (path === '/auth/me' && method === 'GET') {
    return json({ user: readUser() });
  }

  if (path === '/auth/logout' && method === 'POST') {
    clearUser();
    return json({ ok: true });
  }

  if (path === '/auth/update' && method === 'POST') {
    const body = await readJson(init.body);
    const current = readUser() || { id: 1, email: 'local@example.com' };
    const email = String(body?.email || current.email).trim().toLowerCase();
    const user = { id: current.id, email };
    writeUser(user);
    return json({ ok: true, user });
  }

  return json({ error: 'Mock endpoint not implemented' }, 404);
}
