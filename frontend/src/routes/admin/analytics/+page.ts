import type { PageLoad } from './$types';
import { apiFetch } from '$lib/api';

export const load: PageLoad = async ({ fetch, url }) => {
  try {
    const timeRange = url.searchParams.get('timeRange') || '30d';
    const userId = url.searchParams.get('userId') || '';
    const gameType = url.searchParams.get('gameType') || '';
    const difficulty = url.searchParams.get('difficulty') || '';
    const dateFrom = url.searchParams.get('dateFrom') || '';
    const dateTo = url.searchParams.get('dateTo') || '';
    
    const params = new URLSearchParams();
    if (timeRange) params.set('timeRange', timeRange);
    if (userId) params.set('userId', userId);
    if (gameType) params.set('gameType', gameType);
    if (difficulty) params.set('difficulty', difficulty);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    
    const response = await apiFetch(`/api/admin/analytics?${params.toString()}`);
    const data = await response.json();
    
    if (data.ok) {
      return {
        analytics: data.analytics
      };
    }
    
    return {
      analytics: {
        gameTypeStats: {},
        difficultyStats: {},
        scoreDistribution: [0, 0, 0, 0, 0],
        topPerformers: [],
        availableUsers: [],
        filters: { userId, gameType, difficulty, dateFrom, dateTo },
        timeRange
      }
    };
  } catch (error) {
    console.error('[admin analytics] Error loading analytics:', error);
    return {
      analytics: {
        gameTypeStats: {},
        difficultyStats: {},
        scoreDistribution: [0, 0, 0, 0, 0],
        topPerformers: [],
        availableUsers: [],
        filters: {},
        timeRange: '30d'
      }
    };
  }
};
