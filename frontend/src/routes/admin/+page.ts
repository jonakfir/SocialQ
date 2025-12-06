import type { PageLoad } from './$types';
import { apiFetch } from '$lib/api';

export const load: PageLoad = async ({ fetch }) => {
  try {
    const response = await apiFetch('/api/admin/stats');
    const data = await response.json();
    
    if (data.ok) {
      return {
        stats: data.stats
      };
    }
    
    return {
      stats: {
        totalUsers: 0,
        totalSessions: 0,
        todaySessions: 0,
        todayActiveUsers: 0,
        adminCount: 0
      }
    };
  } catch (error) {
    console.error('[admin dashboard] Error loading stats:', error);
    return {
      stats: {
        totalUsers: 0,
        totalSessions: 0,
        todaySessions: 0,
        todayActiveUsers: 0,
        adminCount: 0
      }
    };
  }
};
