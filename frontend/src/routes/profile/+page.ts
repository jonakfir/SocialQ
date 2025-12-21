export const ssr = false;
export const prerender = false;

import type { PageLoad } from './$types';
import { apiFetch } from '$lib/api';

export const load: PageLoad = async () => {
  try {
    // Only fetch user (profile page doesn't need collages)
    const r = await apiFetch('/auth/me');
    const { user } = await r.json();
    return { user: user ?? null, collages: [] };
  } catch {
    return { user: null, collages: [] };
  }
};