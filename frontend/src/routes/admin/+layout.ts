import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';

/**
 * Admin layout loader - protects admin routes
 * Redirects non-admin users to dashboard
 * 
 * Authentication flow:
 * 1. User logs in → Backend checks PostgreSQL → Returns JWT token → Stored in localStorage
 * 2. Admin layout → Sends JWT in Authorization header → Backend validates against PostgreSQL
 * 
 * Uses JWT tokens in Authorization headers instead of cookies to avoid third-party cookie blocking.
 * The backend validates the JWT and checks PostgreSQL for user data.
 */
export const load: LayoutLoad = async ({ fetch, request }) => {
  // CLIENT-SIDE: Get JWT token from localStorage and add to request
  let authToken = null;
  if (browser) {
    try {
      authToken = localStorage.getItem('auth_token');
      if (authToken) {
        console.log('[Admin Layout] Found JWT token in localStorage');
      }
    } catch (e) {
      console.error('[Admin Layout] Error reading auth token:', e);
    }
  }

  try {
    // Use /api proxy which forwards cookies and Authorization header
    const authUrl = '/api/auth/me';
    
    console.log('[Admin Layout] Checking auth at:', authUrl);
    
    // Build headers with JWT token if available
    const headers: HeadersInit = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
      console.log('[Admin Layout] Sending JWT token in Authorization header');
    }
    
    // SvelteKit's fetch in load functions automatically forwards cookies from the browser request
    // We also add JWT token in Authorization header for cross-origin support
    const r = await fetch(authUrl, {
      method: 'GET',
      credentials: 'include',
      headers
    });
    
    console.log('[Admin Layout] Response status:', r.status, 'ok:', r.ok);
    
    if (!r.ok) {
      console.error('[Admin Layout] Auth request failed:', r.status, r.statusText);
      throw redirect(302, '/login');
    }
    
    const responseText = await r.text();
    console.log('[Admin Layout] Response text:', responseText.substring(0, 200));
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[Admin Layout] Failed to parse response:', parseErr);
      throw redirect(302, '/login');
    }
    
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
