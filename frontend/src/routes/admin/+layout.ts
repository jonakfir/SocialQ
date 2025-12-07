import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { env as PUBLIC } from '$env/dynamic/public';

/**
 * Admin layout loader - protects admin routes
 * Redirects non-admin users to dashboard
 */
export const load: LayoutLoad = async ({ fetch }) => {
  try {
    // Use SvelteKit's fetch which automatically forwards cookies
    const base = (PUBLIC.PUBLIC_API_URL || '').replace(/\/+$/, '') || 'http://localhost:4000';
    const authUrl = `${base}/auth/me`;
    
    const r = await fetch(authUrl, {
      method: 'GET',
      credentials: 'include'
    });
    
    const data = await r.json().catch(() => ({ user: null }));
    const user = data?.user;
    
    // Not authenticated - redirect to login
    if (!user) {
      throw redirect(302, '/login');
    }
    
    // Hardcode: jonakfir@gmail.com is ALWAYS admin
    const email = (user.email || user.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || user.role === 'admin';
    
    // Not admin - redirect to dashboard
    if (!isAdmin) {
      throw redirect(302, '/dashboard');
    }
    
    return { user: { ...user, role: 'admin' }, isAdmin: true };
  } catch (error: any) {
    // If it's a redirect, re-throw it
    if (error?.status === 302) {
      throw error;
    }
    // Otherwise, redirect to login on error
    throw redirect(302, '/login');
  }
};
