export const ssr = false;
export const prerender = false;

import type { PageLoad } from './$types';
import { apiFetch } from '$lib/api';

export const load: PageLoad = async ({ params }) => {
  try {
    const r = await apiFetch('/auth/me');
    const { user } = await r.json();
    
    if (!user) {
      return { user: null, friend: null, collages: [] };
    }

    const friendId = params.friendId;

    // Fetch friend's photos
    let collages: any[] = [];
    try {
      const photosRes = await apiFetch(`/api/friends/${friendId}/photos`);
      const photosData = await photosRes.json();
      if (photosData.ok) {
        collages = photosData.collages || [];
      }
    } catch {
      // Ignore errors
    }

    // Get friend user info
    let friend: any = null;
    try {
      const friendsRes = await apiFetch('/api/friends');
      const friendsData = await friendsRes.json();
      if (friendsData.ok) {
        friend = friendsData.friends.find((f: any) => f.id === friendId);
      }
    } catch {
      // Ignore errors
    }

    return { user: user ?? null, friend, collages };
  } catch {
    return { user: null, friend: null, collages: [] };
  }
};

