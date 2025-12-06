import type { PageLoad } from './$types';
import { apiFetch } from '$lib/api';

export const ssr = false;
export const prerender = false;

export const load: PageLoad = async ({ fetch, url }) => {
  try {
    const search = url.searchParams.get('search') || '';
    const dateFrom = url.searchParams.get('dateFrom') || '';
    const dateTo = url.searchParams.get('dateTo') || '';
    const dateRange = url.searchParams.get('dateRange') || 'all';
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset)
    });
    if (search) {
      params.append('search', search);
    }
    if (dateFrom) {
      params.append('dateFrom', dateFrom);
    }
    if (dateTo) {
      params.append('dateTo', dateTo);
    }
    if (dateRange) {
      params.append('dateRange', dateRange);
    }
    
    const response = await apiFetch(`/api/admin/stats/users?${params.toString()}`);
    const data = await response.json();
    
    if (data.ok) {
      return {
        users: data.users || [],
        total: data.total || 0,
        limit: data.limit || limit,
        offset: data.offset || offset,
        dateRange
      };
    }
    
    return {
      users: [],
      total: 0,
      limit,
      offset,
      dateRange
    };
  } catch (error) {
    console.error('[admin users] Error loading users:', error);
    return {
      users: [],
      total: 0,
      limit: 50,
      offset: 0,
      dateRange: 'all'
    };
  }
};
