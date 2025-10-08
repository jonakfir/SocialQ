<!-- src/lib/components/Header.svelte -->
<script context="module">
  // Client-only (safe to use document/window)
  export const ssr = false;
</script>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto, afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import { apiFetch } from '$lib/api';

  // Passed from +layout.svelte (prefer { id, email })
  export let user: { id?: number; email?: string } | null = null;
  export let showProfile = true;
  export let showMenu = true;

  let isOpen = false;
  let wrapEl: HTMLDivElement | undefined;

  // ---------- camera/mic gating (tracks & stops streams on disallowed routes) ----------
  // Add any routes that legitimately need live camera here:
  const ALLOW = [
    /^\/upload(\/|$)/,                 // one-emotion, collage, etc.
    /^\/training(\/|$)/,               // your training flows
    /^\/mirroring(\/|$)/,              // mirroring game
    /^\/facial-recognition(\/|$)/,     // if used
    /^\/transition-recognition(\/|$)/  // if used
  ];

  let trackedStreams: MediaStream[] = [];
  function stopAllStreams() {
    for (const s of trackedStreams) {
      try { s.getTracks().forEach((t) => t.stop()); } catch {}
    }
    trackedStreams = [];
  }

  // Wrap getUserMedia once so we can stop streams when navigating away
  onMount(() => {
    const md: any = navigator?.mediaDevices;
    if (md && !md.__afWrapped) {
      const orig = md.getUserMedia.bind(md);
      md.getUserMedia = async (constraints: MediaStreamConstraints) => {
        const s: MediaStream = await orig(constraints);
        trackedStreams.push(s);
        s.getTracks().forEach((t) =>
          t.addEventListener?.('ended', () => {
            trackedStreams = trackedStreams.filter((x) => x !== s);
          })
        );
        return s;
      };
      md.__afWrapped = true;
    }
  });

  // react to route changes & stop streams if current path is not allowed
  $: currentPath = $page.url.pathname.toLowerCase();
  $: canRecord = ALLOW.some((rx) => rx.test(currentPath));
  $: if (!canRecord && trackedStreams.length) {
    stopAllStreams();
  }

  onDestroy(() => stopAllStreams());

  // ---------- helpers ----------
  function initialFromEmail(email?: string): string {
    if (!email) return '❔';
    const local = email.includes('@') ? email.split('@')[0] : email;
    const ch = local.trim().charAt(0);
    return ch ? ch.toUpperCase() : '❔';
  }

  function persistUser(u: typeof user | null) {
    if (typeof localStorage === 'undefined') return;
    if (u && u.email) {
      localStorage.setItem('email', u.email);
      // keep legacy keys for older code paths
      localStorage.setItem('username', u.email);
      if (u.id != null) localStorage.setItem('userId', String(u.id));
    }
  }

  async function refreshMe() {
    try {
      const res = await apiFetch('/auth/me');
      const j = await res.json();
      user = j?.user ?? null;
      persistUser(user);
    } catch {
      // ignore network/unauth errors; keep current header state
    }
  }

  // Fallback to localStorage immediately (prevents initial flicker)
  onMount(() => {
    if (!user && typeof localStorage !== 'undefined') {
      const email = localStorage.getItem('email') || localStorage.getItem('username') || '';
      const idStr = localStorage.getItem('userId') || '';
      if (email) user = { id: Number(idStr) || undefined, email };
    }
    // Then fetch fresh session user
    refreshMe();
  });

  // Keep header in sync as the SPA navigates
  afterNavigate(() => {
    isOpen = false;
    refreshMe();
  });

  // outside-click to close the menu
  function onDocClick(e: MouseEvent) {
    if (!wrapEl) return;
    if (!wrapEl.contains(e.target as Node)) isOpen = false;
  }
  onMount(() => document.addEventListener('click', onDocClick));
  onDestroy(() => document.removeEventListener('click', onDocClick));

  function toggleMenu(e: MouseEvent) {
    e.stopPropagation();
    isOpen = !isOpen;
  }
  function closeMenu() { isOpen = false; }

  // --- navigation / auth actions ---
  function goToProfile() {
    closeMenu();
    goto(user ? '/profile' : '/login');
  }
  function goToDashboard() {
    closeMenu();
    goto('/dashboard');
  }
  async function doLogout() {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    try {
      localStorage.removeItem('email');
      localStorage.removeItem('username'); // legacy
      localStorage.removeItem('userId');
    } catch {}
    user = null;
    closeMenu();
    goto('/login');
  }

  // reactive initial/title
  $: initial = initialFromEmail(user?.email);
  $: titleText = user?.email ?? 'Not signed in';
</script>

<div class="header">
  {#if showProfile}
    <button
      class="profile"
      aria-label="Profile"
      title={titleText}
      on:click={goToProfile}
    >
      {initial}
    </button>
  {/if}

  {#if showMenu}
    <div class="menu-wrap" bind:this={wrapEl}>
      <button
        class="menu"
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="Menu"
        on:click={toggleMenu}
      >☰</button>

      <div class="menu-pop" data-open={isOpen}>
        <button class="item" on:click={goToDashboard}>Dashboard</button>
        {#if user}
          <button class="item" on:click={doLogout}>Logout</button>
        {:else}
          <button class="item" on:click={() => { closeMenu(); goto('/login'); }}>Login</button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .header {
    position: absolute;
    top: 20px;
    left: 0; right: 0;
    padding: 0 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 1000;
  }

  .profile, .menu {
    width: 40px; height: 40px;
    border-radius: 50%;
    border: 2px solid #111;
    display: grid;
    place-items: center;
    font-weight: 800;
    background: #fff;
    cursor: pointer;
    font-size: 16px;
    margin: 0;
  }
  .profile:hover, .menu:hover { background: #4f46e5; color: #fff; }

  .menu-wrap { position: relative; }
  .menu-pop {
    position: absolute;
    right: 0; top: 46px;
    min-width: 180px;
    background: #fff;
    border: 1.5px solid #111;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,.18);
    padding: 8px;
    display: none;
    z-index: 1001;
  }
  .menu-pop[data-open="true"] { display: block; }
  .item {
    display: block; width: 100%; text-align: left;
    background: #fff; border: 0; padding: 12px 14px;
    border-radius: 8px; cursor: pointer; font-weight: 701;
  }
  .item:hover { background: #4f46e5; color: #fff; }
</style>
