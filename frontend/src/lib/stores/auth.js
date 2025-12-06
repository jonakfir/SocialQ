import { writable } from 'svelte/store';

export const user = writable(null); // { id, username } | null

export async function fetchMe() {
  try {
    const res = await fetch('http://localhost:4000/auth/me', { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    user.set(data?.user ?? null);
    return data?.user ?? null;
  } catch {
    user.set(null);
    return null;
  }
}

export function setUser(u: any) {
  user.set(u ?? null);
}
