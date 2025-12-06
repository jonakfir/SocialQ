// frontend/src/lib/api.ts
import { env as PUBLIC } from '$env/dynamic/public';
import { dev } from '$app/environment';

/**
 * Base URL for the API (from PUBLIC_API_URL). If absent, use SvelteKit /api proxy.
 */
const ABS_BASE = (PUBLIC.PUBLIC_API_URL || '').replace(/\/+$/, '');
const buildURL = (p: string) => (ABS_BASE ? `${ABS_BASE}${p}` : `/api${p}`);

// ============================================================================
// Localhost auth mock (dev convenience only)
// ============================================================================

const LS_KEY = 'mock_auth_user';

/** True when we should mock `/auth/*` on localhost in dev. */
function isLocalMock(): boolean {
  if (!dev) return false;
  try {
    // In browser context
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
    }
    // In server/load function context - always mock in dev mode
    return true;
  } catch {
    // Fallback: always mock in dev mode
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

// ============================================================================
// Public fetch helper
// ============================================================================

/**
 * Unified fetch that:
 *  - uses PUBLIC_API_URL (or /api) for real requests
 *  - mocks /auth/* endpoints when running locally in dev
 *  - adds mock auth headers for /api/* endpoints in dev mode
 *  - /api/* routes always stay local (use SvelteKit routes, not backend)
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const shouldMock = isLocalMock() && path.startsWith('/auth/');
  if (!shouldMock) {
    // /api/* and /ekman routes should always use SvelteKit routes (stay on same origin)
    // Don't send them to the backend via PUBLIC_API_URL
    const url = (path.startsWith('/api/') || path.startsWith('/ekman')) ? path : buildURL(path);
    const headers = new Headers(init.headers ?? {});
    
    // Add mock auth headers for /api/*, /ekman, and /admin endpoints in dev mode if user is logged in via mock
    if (isLocalMock() && (path.startsWith('/api/') || path.startsWith('/ekman') || path.startsWith('/admin')) && typeof window !== 'undefined') {
      try {
        const mockUser = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
        if (mockUser && mockUser.id && mockUser.email) {
          headers.set('X-User-Id', String(mockUser.id));
          headers.set('X-User-Email', mockUser.email);
          console.log('[apiFetch] Added mock auth headers for', path, 'User:', mockUser.email);
        } else {
          console.warn('[apiFetch] No mock user found for', path);
        }
      } catch (error) {
        console.error('[apiFetch] Error reading mock user:', error);
        // Ignore localStorage errors
      }
    }
    
    if (!headers.has('content-type') && init.body && typeof init.body === 'string') {
      headers.set('content-type', 'application/json');
    }
    return fetch(url, { ...init, headers, credentials: 'include' });
  }

  // -----------------------
  // Mocked /auth/* endpoints
  // -----------------------
  const readUser = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
  };
  const writeUser = (u: any) => localStorage.setItem(LS_KEY, JSON.stringify(u));
  const clearUser = () => localStorage.removeItem(LS_KEY);

  const method = (init.method || 'GET').toUpperCase();

  if (path === '/auth/login' && method === 'POST') {
    const body = await readJson(init.body);
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    
    if (!email || !password) {
      return json({ error: 'Email and password required' }, 400);
    }
    
    // Check if user exists in Prisma database (for mock mode)
    try {
      const checkRes = await fetch('/api/auth/check-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const checkData = await checkRes.json().catch(() => ({}));
      
      if (!checkData.ok || !checkData.exists) {
        return json({ error: 'Invalid email or password' }, 401);
      }
      
      if (checkData.validPassword === false) {
        return json({ error: 'Invalid email or password' }, 401);
      }
      
      // User exists and password is valid
      const user = { 
        id: checkData.user.id, 
        email: checkData.user.username,
        role: checkData.user.role || 'personal'
      };
      writeUser(user);
      return json({ ok: true, user });
    } catch (error) {
      console.error('[mock login] Error checking user:', error);
      // If check fails, don't allow login
      return json({ error: 'Authentication service unavailable' }, 500);
    }
  }

  if (path === '/auth/register' && method === 'POST') {
    const body = await readJson(init.body);
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    
    if (!email || !password) {
      return json({ error: 'Email and password required' }, 400);
    }
    
    // Check if user already exists in Prisma (mock mode validation)
    try {
      const checkRes = await fetch('/api/auth/check-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }) // Just check existence, no password
      });
      
      const checkData = await checkRes.json().catch(() => ({}));
      
      if (checkData.exists) {
        return json({ error: 'Email already registered' }, 409);
      }
    } catch (error) {
      console.error('[mock register] Error checking user:', error);
      // Continue with registration if check fails
    }
    
    // Create user in Prisma with actual password
    try {
      const syncRes = await fetch('/api/sync-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, backendUserId: 1, password })
      });
      
      const syncData = await syncRes.json().catch(() => ({}));
      
      if (!syncData.ok || !syncData.user) {
        return json({ error: 'Failed to create user' }, 500);
      }
      
      // User created successfully in Prisma - fetch full user with role
      const fullUserRes = await fetch('/api/auth/check-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const fullUserData = await fullUserRes.json().catch(() => ({}));
      
      const user = { 
        id: syncData.user.id, 
        email: syncData.user.username,
        role: fullUserData.user?.role || 'personal'
      };
      writeUser(user);
      return json({ ok: true, user });
    } catch (error) {
      console.error('[mock register] Error creating user:', error);
      return json({ error: 'Registration failed' }, 500);
    }
  }

  if (path === '/auth/me' && method === 'GET') {
    const storedUser = readUser();
    // If we have a stored user, fetch their role from Prisma
    if (storedUser && storedUser.email) {
      try {
        const checkRes = await fetch('/api/auth/check-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: storedUser.email })
        });
        const checkData = await checkRes.json().catch(() => ({}));
        if (checkData.ok && checkData.user) {
          return json({ 
            user: { 
              ...storedUser, 
              role: checkData.user.role || 'personal' 
            } 
          });
        }
      } catch {
        // Fallback to stored user without role update
      }
    }
    return json({ user: storedUser });
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

// ============================================================================
// High-level helpers
// ============================================================================

/** POST JSON to backend (throws on HTTP error). */
export async function postJSON<T = any>(path: string, data: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** GET JSON from backend (throws on HTTP error). */
export async function getJSON<T = any>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: 'GET' });
  if (!res.ok) {
    const msg = await res.text().catch(() => `${res.status} ${res.statusText}`);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Notify WhatsApp of an emotion inference (backend relays to WhatsApp Cloud API).
 * Backend expected endpoint: POST /notify/emotion
 * Body:
 *   { to, subject?, emotion, confidence, useTemplate? }
 */
export async function notifyEmotion(args: {
  to: string;               // E.164 number, e.g., "+15551234567"
  subject?: string;         // Optional label/person
  emotion: string;          // e.g., "Happy"
  confidence: number;       // 0..1
  useTemplate?: boolean;    // defaults to true (emotion_report_v1)
}) {
  const payload = { ...args, useTemplate: args.useTemplate ?? true };
  return postJSON('/notify/emotion', payload);
}

