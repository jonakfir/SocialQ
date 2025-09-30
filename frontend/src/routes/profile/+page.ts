export const ssr = false;
export const prerender = false;

import type { PageLoad } from './$types';
import { apiFetch } from '$lib/api';

export const load: PageLoad = async () => {
  try {
    const r = await apiFetch('/auth/me');
    const { user } = await r.json();
    return { user: user ?? null };
  } catch {
    return { user: null };
  }
};