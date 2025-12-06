import type { PageLoad } from './$types';
import { apiFetch } from '$lib/api';

export const load: PageLoad = async ({ params, fetch }) => {
  try {
    const userId = params.userId;
    
    if (!userId) {
      return {
        user: null,
        stats: null
      };
    }
    
    const response = await apiFetch(`/api/admin/stats/users/${userId}`);
    const data = await response.json();
    
    if (data.ok) {
      return {
        user: data.user,
        stats: data.stats,
        friends: data.friends,
        collages: data.collages
      };
    }
    
    return {
      user: null,
      stats: null,
      friends: null,
      collages: null
    };
  } catch (error) {
    console.error('[admin user detail] Error loading user:', error);
    return {
      user: null,
      stats: null,
      friends: null,
      collages: null
    };
  }
};
