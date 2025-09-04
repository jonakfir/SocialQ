import type { LayoutLoad } from './$types';
import { apiFetch } from '$lib/api';

export const ssr = false;       // render only in the browser so cookies are sent
export const prerender = false; // this is a dynamic app

export const load: LayoutLoad = async () => {
  try {
    const r = await apiFetch('/auth/me');
    const { user } = await r.json();
    return { user: user ?? null };
  } catch {
    return { user: null };
  }
};
