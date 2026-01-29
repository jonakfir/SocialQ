import type { LayoutLoad } from './$types';
import { apiFetch } from '$lib/api';

export const ssr = false;       // render only in the browser so cookies are sent
export const prerender = false; // this is a dynamic app

export const load: LayoutLoad = async () => {
  try {
    // Fetch user to get dark mode preference
    const r = await apiFetch('/auth/me');
    const { user } = await r.json();
    return { user: user ?? null, isAdmin: false };
  } catch {
    // Return immediately - don't block page render with auth check
    // Auth can be checked client-side after page loads
    return { user: null, isAdmin: false };
  }
};
