export const ssr = false;
export const prerender = false;

import type { PageLoad } from './$types';
import { apiFetch } from '$lib/api';

export const load: PageLoad = async () => {
  try {
    // Only fetch user, let the page component fetch collages on mount (faster initial load)
    const r = await apiFetch('/auth/me');
    const { user } = await r.json();
    return { user: user ?? null, collages: [] }; // Empty collages, will be loaded on mount
  } catch {
    return { user: null, collages: [] };
  }
};

