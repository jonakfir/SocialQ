import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { env as PUBLIC } from '$env/dynamic/public';

/**
 * Admin layout loader - protects admin routes
 * Redirects non-admin users to dashboard
 */
export const load: LayoutLoad = async ({ fetch }) => {
  try {
    // Use /api proxy route which properly forwards cookies via hooks.server.ts
    // This ensures cookies are forwarded correctly even for cross-origin requests
    const authUrl = '/api/auth/me';
    
    console.log('[Admin Layout] Checking auth at:', authUrl);
    
    // SvelteKit's fetch automatically forwards cookies from the browser
    const r = await fetch(authUrl, {
      method: 'GET',
      credentials: 'include'
    });
    
    console.log('[Admin Layout] Response status:', r.status, 'ok:', r.ok);
    
    const data = await r.json().catch(() => ({ user: null }));
    const user = data?.user;
    
    console.log('[Admin Layout] Auth check - user:', user ? `${user.email} (${user.role})` : 'null');
    
    // Not authenticated - redirect to login
    if (!user) {
      console.log('[Admin Layout] No user found, redirecting to login');
      throw redirect(302, '/login');
    }
    
    // Hardcode: jonakfir@gmail.com is ALWAYS admin
    const email = (user.email || user.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || user.role === 'admin';
    
    console.log('[Admin Layout] Email:', email, 'IsAdmin:', isAdmin);
    
    // Not admin - redirect to dashboard
    if (!isAdmin) {
      console.log('[Admin Layout] Not admin, redirecting to dashboard');
      throw redirect(302, '/dashboard');
    }
    
    console.log('[Admin Layout] ✅ Admin access granted');
    return { user: { ...user, role: 'admin' }, isAdmin: true };
  } catch (error: any) {
    // If it's a redirect, re-throw it
    if (error?.status === 302) {
      throw error;
    }
    console.error('[Admin Layout] Error:', error);
    // Otherwise, redirect to login on error
    throw redirect(302, '/login');
  }
};
