import type { PageLoad } from './$types';
import { apiFetch } from '$lib/api';

export const ssr = false;
export const prerender = false;

export const load: PageLoad = async ({ fetch }) => {
  try {
    const response = await apiFetch('/api/admin/stats/users?limit=1000&offset=0');
    const data = await response.json();

    if (data.ok) {
      return {
        users: data.users || [],
        total: data.total || 0
      };
    }

    return { users: [], total: 0 };
  } catch (error) {
    console.error('[admin subscriptions] Error loading users:', error);
    return { users: [], total: 0 };
  }
};
