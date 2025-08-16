<!-- src/lib/components/Header.svelte -->

<script context="module">
  // Client-only (safe to use document/window)
  export const ssr = false;
</script>

<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto, afterNavigate } from '$app/navigation';
  import { apiFetch } from '$lib/api';

  // Passed in from +layout.svelte: <Header user={data.user} />
  export let user = null;            // { id, username } | null
  export let showProfile = true;
  export let showMenu = true;

  let isOpen = false;
  let wrapEl;                        // ref for outside-click

  $: if (user && user.username && typeof localStorage !== 'undefined') {
    localStorage.setItem('username', user.username);
    if (user.id != null) localStorage.setItem('userId', String(user.id));
  }

  // Optional: fallback to localStorage so the initial doesn't flicker
  onMount(() => {
    if (!user && typeof localStorage !== 'undefined') {
      const name = localStorage.getItem('username');
      if (name) {
        user = { id: Number(localStorage.getItem('userId')) || -1, username: name };
      }
    }
  });

  // --- menu behaviour ---
  function toggleMenu(e) {
    e.stopPropagation();
    isOpen = !isOpen;
  }
  function closeMenu() { isOpen = false; }

  function onDocClick(e) {
    if (!wrapEl) return;
    if (!wrapEl.contains(e.target)) isOpen = false;
  }
  onMount(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('click', onDocClick);
      return () => document.removeEventListener('click', onDocClick);
    }
  });
  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', onDocClick);
    }
  });
  afterNavigate(() => { isOpen = false; });

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
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {}
    try {
      localStorage.removeItem('username');
      localStorage.removeItem('userId');
    } catch {}
    closeMenu();
    goto('/login');
  }

  $: initial = user?.username?.[0]?.toUpperCase?.() ?? '❔';
</script>

<div class="header">
  {#if showProfile}
    <button
      class="profile"
      aria-label="Profile"
      title={user ? user.username : 'Not signed in'}
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
    border-radius: 8px; cursor: pointer; font-weight: 700;
  }
  .item:hover { background: #4f46e5; color: #fff; }
</style>
