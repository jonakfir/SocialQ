export const ssr = false;
export const prerender = false;

import type { PageLoad } from './$types';
import { apiFetch } from '$lib/api';

export const load: PageLoad = async () => {
  try {
    const r = await apiFetch('/auth/me');
    const { user } = await r.json();
    
    // Fetch collages if user is logged in
    let collages: any[] = [];
    if (user) {
      try {
        const collagesRes = await apiFetch('/api/collages');
        const collagesData = await collagesRes.json();
        if (collagesData.ok) {
          collages = collagesData.collages || [];
        }
      } catch {
        // Ignore errors loading collages
      }
    }
    
    return { user: user ?? null, collages };
  } catch {
    return { user: null, collages: [] };
  }
};