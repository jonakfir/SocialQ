<!-- src/routes/edit-profile/+page.svelte -->
<script context="module" lang="ts">
  // Client-only so the auth check runs with the browser's cookie
  export const ssr = false;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  // Same-origin API with cookies included
  const api = (path: string, init: RequestInit = {}) =>
    fetch(`/api${path}`, { credentials: 'include', ...init });

  let loading = true;
  let saving = false;
  let error = '';

  let email = '';
  let originalEmail = '';
  let userId: number | null = null;
  let unauth = false;

  // ---------- helpers ----------
  const norm = (s: string) => (s || '').trim().toLowerCase();
  const makeUserKey = (id: number | null, key: string) =>
    (id != null ? `${id}:${norm(key)}` : norm(key));

  function migrateLocalData(oldKey: string, newKey: string) {
    if (!oldKey || !newKey || oldKey === newKey) return;
    const prefixes = ['fr_history_', 'tr_details_', 'tr_last_run_'];
    for (const p of prefixes) {
      const oldK = p + oldKey;
      const newK = p + newKey;
      const val = localStorage.getItem(oldK);
      if (val != null) {
        if (localStorage.getItem(newK) == null) localStorage.setItem(newK, val);
        localStorage.removeItem(oldK);
      }
    }
  }

  async function loadMe() {
    try {
      const res = await api('/auth/me');
      const data = await res.json().catch(() => ({} as any));
      if (!data?.user) {
        unauth = true; // show prompt instead of hard redirect
        return;
      }
      userId = data.user.id ?? null;
      email = data.user.email ?? '';
      originalEmail = email;
    } catch {
      error = 'Could not load your profile.';
    } finally {
      loading = false;
    }
  }
  onMount(loadMe);

  function validate(): boolean {
    const e = email.trim();
    if (!e) { error = 'Email is required.'; return false; }
    if (e.length < 3 || !e.includes('@') || !e.includes('.')) {
      error = 'Please enter a valid email address.'; return false;
    }
    return true;
  }

  let newPassword = '';

  async function save(ev: Event) {
    ev.preventDefault();
    error = '';
    if (!validate()) return;

    const noChange = email.trim() === originalEmail && !newPassword;
    if (noChange) { error = 'Nothing to update.'; return; }

    saving = true;
    try {
      const res = await api('/auth/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          ...(newPassword ? { password: newPassword } : {})
        })
      });

      const data = await res.json().catch(() => ({} as any));

      if (res.status === 401) {
        unauth = true;
        error = 'Your session expired. Please log in again.';
        return;
      }

      if (res.ok && (data.ok || data.success)) {
        try {
          const id = (data?.user?.id ?? userId) as number | null;
          const newEmail = data?.user?.email ?? email;
          const oldKey = makeUserKey(id, originalEmail);
          const newKey = makeUserKey(id, newEmail);
          migrateLocalData(oldKey, newKey);

          // keep header/profile initial in sync
          localStorage.setItem('userEmail', newEmail);
          if (id != null) localStorage.setItem('userId', String(id));
        } catch {}
        goto('/profile');
        return;
      }

      error = data?.error || `Update failed (status ${res.status}).`;
    } catch {
      error = 'Network error.';
    } finally {
      saving = false;
    }
  }
</script>

<style>
  .blobs { position: fixed; inset: 0; pointer-events: none; z-index: 1; }

  .container {
    display: grid; place-items: center;
    min-height: 100vh; width: 100vw;
    position: relative; z-index: 2; padding: 24px;
  }

  .edit-box {
    background: rgba(255,255,255,0.6);
    backdrop-filter: blur(20px);
    padding: 32px 24px; border-radius: 20px;
    width: min(360px, 92vw); text-align: center;
    box-shadow: 0 4px 30px rgba(0,0,0,0.2); z-index: 3;
  }

  h2 {
    font-size: 2rem; margin-bottom: 16px;
    font-family: 'Georgia', serif; color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 4px 10px rgba(0,0,0,0.4);
  }

  form { display: grid; gap: 12px; width: 100%; }

  input[type="email"], input[type="password"] {
    width: 100%; box-sizing: border-box;
    padding: 10px 12px; border: 1.5px solid rgba(17,17,17,.18);
    border-radius: 10px; background: rgba(255,255,255,.95);
    font-size: 15px; outline: none;
    transition: border-color .2s, box-shadow .2s;
  }
  input:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.15); }

  .hint { text-align: left; font-size: 12px; color: rgba(17,17,17,.6); margin-top: -6px; }

  .btn {
    display: block; width: 100%; padding: 12px 14px;
    border-radius: 9999px; font-weight: 700; font-size: 15px;
    cursor: pointer; border: 2px solid #111; background: #fff; color: #111;
    transition: transform .05s, filter .2s, background .2s; box-sizing: border-box;
  }
  .btn:hover { filter: brightness(1.03); }
  .btn:active { transform: translateY(1px); }
  .primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
  .outline { background: transparent; border-color: #111; color: #111; }

  .error { margin-top: 8px; color: #b91c1c; font-weight: 700; }
  .row { display: grid; gap: 8px; }

  .notice {
    background: rgba(255,255,255,.85);
    border: 1px solid rgba(17,17,17,.2);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 12px;
  }
</style>

<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="container">
  <div class="edit-box">
    <h2>Edit Profile</h2>

    {#if loading}
      <div>Loading…</div>
    {:else}
      {#if unauth}
        <div class="notice">
          You’re not signed in or your session expired.
        </div>
        <button class="btn primary" on:click={() => goto('/login')}>Log in</button>
        <button class="btn outline" on:click={() => goto('/dashboard')}>Back</button>
      {:else}
        <form on:submit={save} novalidate>
          <div class="row">
            <input
              type="email"
              bind:value={email}
              placeholder="Email"
              autocomplete="email"
              required
              aria-label="Email"
            />
            <div class="hint">Use the email you want to sign in with.</div>

            <input
              type="password"
              bind:value={newPassword}
              placeholder="New Password (optional)"
              autocomplete="new-password"
              aria-label="New password (optional)"
            />
          </div>

          <button class="btn primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>

        {#if error}<div class="error" aria-live="polite">{error}</div>{/if}

        <button class="btn outline" on:click={() => goto('/profile')}>Cancel</button>
      {/if}
    {/if}
  </div>
</div>
