export const ssr = false;
export const prerender = false;

import type { PageLoad } from './$types';
import { apiFetch } from '$lib/api';

export const load: PageLoad = async () => {
  try {
    const r = await apiFetch('/auth/me');
    const { user } = await r.json();
    
    if (!user) {
      return { user: null, friends: [], requests: { sent: [], received: [] } };
    }

    // Fetch friends list
    let friends: any[] = [];
    try {
      const friendsRes = await apiFetch('/api/friends');
      const friendsData = await friendsRes.json();
      if (friendsData.ok) {
        friends = friendsData.friends || [];
      }
    } catch {
      // Ignore errors
    }

    // Fetch friend requests
    let requests = { sent: [], received: [] };
    try {
      const requestsRes = await apiFetch('/api/friends/requests');
      const requestsData = await requestsRes.json();
      if (requestsData.ok) {
        requests = {
          sent: requestsData.sent || [],
          received: requestsData.received || []
        };
      }
    } catch {
      // Ignore errors
    }

    return { user: user ?? null, friends, requests };
  } catch {
    return { user: null, friends: [], requests: { sent: [], received: [] } };
  }
};

