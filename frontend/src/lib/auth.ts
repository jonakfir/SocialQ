import type { RequestEvent } from '@sveltejs/kit';
import { apiFetch } from './api';

/**
 * Get the current user from the backend API
 * This checks the session cookie/JWT via /auth/me
 */
export async function getCurrentUser(event: RequestEvent): Promise<{ id: string; username?: string; email?: string } | null> {
  try {
    // Use apiFetch which handles cookies automatically
    const response = await apiFetch('/auth/me', {
      method: 'GET'
    });
    
    const data = await response.json();
    return data?.user ?? null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

