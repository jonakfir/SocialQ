<!-- src/lib/components/Header.svelte -->
<script context="module">
  export const ssr = false;
</script>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto, afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import { apiFetch } from '$lib/api';

  /** Public props */
  export let user: { id?: number; email?: string } | null = null;
  export let showProfile: boolean = true;
  export let showMenu: boolean = true;

  /** Visibility overrides:
   *  - If forceHide is true → header never shows
   *  - Else if forceShow is true → header always shows
   *  - Else default: only on /dashboard
   */
  export let forceShow: boolean | undefined;
  export let forceHide: boolean | undefined;

  let isOpen = false;
  let wrapEl: HTMLDivElement | undefined;

  // ---------- camera/mic gating (same as before) ----------
  const ALLOW = [/^\/mirroring(\/|$)/, /^\/training(\/|$)/];
  $: currentPath = $page.url.pathname.toLowerCase();
  $: canRecord = ALLOW.some((rx) => rx.test(currentPath));

  let trackedStreams: MediaStream[] = [];

  onMount(() => {
    // track created streams so we can stop them on route changes
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

  function stopAllStreams() {
    for (const s of trackedStreams) {
      try { s.getTracks().forEach((t) => t.stop()); } catch {}
    }
    trackedStreams = [];
  }

  // Stop camera immediately when we navigate to routes that shouldn't use it
  $: if (!canRecord && trackedStreams.length) stopAllStreams();

  onDestroy(() => stopAllStreams());

  // ---------- helpers / auth ----------
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
    } catch {}
  }

  onMount(() => {
    if (!user && typeof localStorage !== 'undefined') {
      const email = localStorage.getItem('email') || localStorage.getItem('username') || '';
      const idStr = localStorage.getItem('userId') || '';
      if (email) user = { id: Number(idStr) || undefined, email };
    }
    refreshMe();
  });

  afterNavigate(() => {
    isOpen = false;
    refreshMe();
  });

  function onDocClick(e: MouseEvent) {
    if (!wrapEl) return;
    if (!wrapEl.contains(e.target as Node)) isOpen = false;
  }
  onMount(() => document.addEventListener('click', onDocClick));
  onDestroy(() => document.removeEventListener('click', onDocClick));

  function toggleMenu(e: MouseEvent) { e.stopPropagation(); isOpen = !isOpen; }
  function closeMenu() { isOpen = false; }

  function goToProfile() { closeMenu(); goto(user ? '/profile' : '/login'); }
  function goToDashboard() { closeMenu(); goto('/dashboard'); }
  async function doLogout() {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    try {
      localStorage.removeItem('email');
      localStorage.removeItem('username');
      localStorage.removeItem('userId');
    } catch {}
    user = null;
    closeMenu();
    goto('/login');
  }

  // ✅ no “initial is not defined” — always initialized
  let userInitial = '❔';
  $: userInitial = initialFromEmail(user?.email);
  $: titleText = user?.email ?? 'Not signed in';

  // ---------- when to render header ----------
  $: pathname = $page.url.pathname.toLowerCase();
  $: showByDefault = pathname === '/dashboard';
  $: visible = forceHide ? false : (forceShow ? true : showByDefault);
</script>

{#if visible}
  <div class="header">
    {#if showProfile}
      <button
        class="profile"
        aria-label="Profile"
        title={titleText}
        on:click={goToProfile}
      >
        {userInitial}
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
{/if}

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
    border-radius: 8px; cursor: pointer; font-weight: 700;
  }
  .item:hover { background: #4f46e5; color: #fff; }
</style>
