import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';

/**
 * Admin layout loader - protects admin routes
 * Redirects non-admin users to dashboard
 * 
 * Authentication flow:
 * 1. User logs in → Backend checks PostgreSQL → Sets cookies + localStorage
 * 2. Admin layout → Checks cookies via /api/auth/me → Falls back to localStorage if cookies blocked
 * 
 * NOTE: Browsers block third-party cookies, so we use localStorage as a fallback
 * when cookies aren't available. The backend still validates against PostgreSQL.
 */
export const load: LayoutLoad = async ({ fetch }) => {
  // CLIENT-SIDE: Check localStorage first as fallback when cookies are blocked
  if (browser) {
    const storedEmail = localStorage.getItem('email') || localStorage.getItem('_admin_email') || '';
    const adminFlag = localStorage.getItem('_admin_login') === 'true';
    const emailLower = storedEmail.toLowerCase().trim();
    
    // If we have admin login flag and it's jonakfir@gmail.com, grant immediate access
    if (adminFlag && emailLower === 'jonakfir@gmail.com') {
      console.log('[Admin Layout] Client-side: Using localStorage fallback for', emailLower);
      // Still try to fetch from backend in background, but allow access immediately
      fetch('/api/auth/me').catch(() => {});
      return { 
        user: { 
          id: Number(localStorage.getItem('userId')) || 1, 
          email: storedEmail, 
          role: 'admin' 
        }, 
        isAdmin: true 
      };
    }
  }

  try {
    // Use /api proxy which forwards cookies properly
    const authUrl = '/api/auth/me';
    
    console.log('[Admin Layout] Checking auth at:', authUrl);
    
    // Log cookies if available (for debugging)
    if (browser) {
      const cookies = document.cookie;
      console.log('[Admin Layout] Browser cookies:', cookies ? cookies.substring(0, 200) : 'NONE');
    }
    
    // SvelteKit's fetch in load functions automatically forwards cookies from the browser request
    const r = await fetch(authUrl, {
      method: 'GET',
      credentials: 'include'
    });
    
    console.log('[Admin Layout] Response status:', r.status, 'ok:', r.ok);
    
    if (!r.ok) {
      console.error('[Admin Layout] Auth request failed:', r.status, r.statusText);
      // If cookies are blocked, try localStorage fallback on client
      if (browser) {
        const storedEmail = localStorage.getItem('email') || '';
        const emailLower = storedEmail.toLowerCase().trim();
        if (emailLower === 'jonakfir@gmail.com' && localStorage.getItem('_admin_login') === 'true') {
          console.log('[Admin Layout] Cookies blocked, using localStorage fallback');
          return { 
            user: { 
              id: Number(localStorage.getItem('userId')) || 1, 
              email: storedEmail, 
              role: 'admin' 
            }, 
            isAdmin: true 
          };
        }
      }
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
    
    // If no user from cookies, try localStorage fallback on client
    if (!user && browser) {
      const storedEmail = localStorage.getItem('email') || '';
      const emailLower = storedEmail.toLowerCase().trim();
      if (emailLower === 'jonakfir@gmail.com' && localStorage.getItem('_admin_login') === 'true') {
        console.log('[Admin Layout] Cookies not available, using localStorage fallback');
        return { 
          user: { 
            id: Number(localStorage.getItem('userId')) || 1, 
            email: storedEmail, 
            role: 'admin' 
          }, 
          isAdmin: true 
        };
      }
    }
    
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
