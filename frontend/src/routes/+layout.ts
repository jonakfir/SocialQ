import type { LayoutLoad } from './$types';
import { apiFetch } from '$lib/api';

export const ssr = false;       // render only in the browser so cookies are sent
export const prerender = false; // this is a dynamic app

export const load: LayoutLoad = async () => {
  // Return immediately with null user to prevent blocking page render
  // Auth check can happen client-side if needed
  try {
    // Use Promise.race to timeout after 1 second to prevent hanging
    const timeoutPromise = new Promise<Response>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 1000)
    );
    
    const r = await Promise.race([
      apiFetch('/auth/me'),
      timeoutPromise
    ]);
    
    const data = await r.json().catch(() => ({ user: null }));
    return { 
      user: data?.user ?? null,
      isAdmin: data?.user?.role === 'admin' || false
    };
  } catch (error) {
    // Silently fail - page should still render
    return { user: null, isAdmin: false };
  }
};
