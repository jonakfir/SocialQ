import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Allow mobile app (no Origin / different origin) to POST to /api/collages without CSRF block
  const path = event.url.pathname;
  const method = event.request.method;
  if (path === '/api/collages' && ['POST', 'PUT', 'PATCH'].includes(method)) {
    const origin = event.request.headers.get('origin');
    const appOrigin = event.url.origin;
    if (!origin || origin !== appOrigin) {
      const headers = new Headers(event.request.headers);
      headers.set('Origin', appOrigin);
      headers.set('Referer', appOrigin + '/');
      event.request = new Request(event.request, { headers });
    }
  }

  // Get env dynamically to avoid circular dependency
  const { env: PUBLIC_ENV } = await import('$env/dynamic/public');
  const base = (PUBLIC_ENV.PUBLIC_API_URL || '').replace(/\/$/, '') ?? '';

  // Intercept server-side `fetch` calls that start with `/api/...`
  const orig = event.fetch;
  event.fetch = (info: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof info === 'string' ? info : (info instanceof URL ? info.href : info.url);

    if (url.startsWith('/api/')) {
      const target = base + url.replace(/^\/api/, '');

      const headers = new Headers(init.headers ?? {});
      // forward incoming cookies to the API
      const cookie = event.request.headers.get('cookie');
      if (cookie) headers.set('cookie', cookie);
      
      // forward Authorization header if present (for JWT tokens)
      // Check both the incoming request AND the fetch call's headers
      const authFromRequest = event.request.headers.get('authorization');
      const authFromInit = headers.get('authorization');
      const auth = authFromInit || authFromRequest;
      if (auth && !headers.has('authorization')) {
        headers.set('authorization', auth);
        console.log('[hooks.server] Forwarding Authorization header to backend');
      }

      return orig(target, { ...init, headers, credentials: 'include' });
    }

    return orig(info as any, init);
  };

  return resolve(event);
};