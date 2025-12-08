import type { Handle } from '@sveltejs/kit';
import { PUBLIC_API_URL } from '$env/static/public';

export const handle: Handle = async ({ event, resolve }) => {
  const base = PUBLIC_API_URL?.replace(/\/$/, '') ?? '';

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