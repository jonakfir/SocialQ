import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { apiFetch } from '$lib/api';

/**
 * Admin layout loader - protects admin routes
 * Redirects non-admin users to dashboard
 */
export const load: LayoutLoad = async ({ fetch }) => {
  try {
    const r = await apiFetch('/auth/me');
    const { user } = await r.json();
    
    // Not authenticated - redirect to login
    if (!user) {
      throw redirect(302, '/login');
    }
    
    // Not admin - redirect to dashboard
    if (user.role !== 'admin') {
      throw redirect(302, '/dashboard');
    }
    
    return { user, isAdmin: true };
  } catch (error: any) {
    // If it's a redirect, re-throw it
    if (error?.status === 302) {
      throw error;
    }
    // Otherwise, redirect to login on error
    throw redirect(302, '/login');
  }
};
