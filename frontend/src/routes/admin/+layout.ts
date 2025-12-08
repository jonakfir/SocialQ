import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { env as PUBLIC } from '$env/dynamic/public';

/**
 * Admin layout loader - protects admin routes
 * Redirects non-admin users to dashboard
 */
export const load: LayoutLoad = async ({ fetch, depends }) => {
  try {
    // Use backend URL directly - SvelteKit's fetch in load functions automatically forwards cookies
    const base = (PUBLIC.PUBLIC_API_URL || '').replace(/\/+$/, '') || 'http://localhost:4000';
    const authUrl = `${base}/auth/me`;
    
    console.log('[Admin Layout] Checking auth at:', authUrl);
    
    // SvelteKit's fetch in load functions automatically forwards cookies from the browser request
    const r = await fetch(authUrl, {
      method: 'GET',
      credentials: 'include'
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
    console.log('[Admin Layout] Full response data:', JSON.stringify(data).substring(0, 300));
    
    // Not authenticated - check localStorage as temporary fallback for jonakfir@gmail.com
    if (!user) {
      // TEMPORARY: Allow jonakfir@gmail.com if in localStorage (cookies might not be set yet)
      if (typeof window !== 'undefined') {
        const storedEmail = localStorage.getItem('email') || localStorage.getItem('username') || '';
        if (storedEmail.toLowerCase().trim() === 'jonakfir@gmail.com') {
          console.log('[Admin Layout] Using localStorage fallback for jonakfir@gmail.com');
          return { 
            user: { id: 1, email: 'jonakfir@gmail.com', role: 'admin' }, 
            isAdmin: true 
          };
        }
      }
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
