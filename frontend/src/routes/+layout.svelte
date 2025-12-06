<!-- src/routes/+layout.svelte -->
<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import Header from '$lib/components/Header.svelte';

  // 👇 import your global Tailwind file (at src/app.css)
  import '../app.css';

  export let data;

  // Hide header on these routes
  const HIDE = new Set(['', '/', '/login', '/create-account', '/create_account']);
  $: hideHeader = HIDE.has(($page.url.pathname || '/').replace(/\/$/, '').toLowerCase()) || 
                  ($page.url.pathname || '/').startsWith('/admin') ||
                  ($page.url.pathname || '/').startsWith('/org/');
  
  // Function to apply/remove no-scroll - check pathname directly, don't rely on reactive
  function updateScrollLock() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    
    const html = document.documentElement;
    const body = document.body;
    // Check the ACTUAL current URL directly
    const currentPath = window.location.pathname || $page.url.pathname || '/';
    const shouldEnableScroll = currentPath.includes('org');
    
    
    if (shouldEnableScroll) {
      // Enable scrolling ONLY for org pages
      html.classList.remove('no-scroll');
      body.classList.remove('no-scroll');
      html.style.setProperty('overflow', '', 'important');
      html.style.setProperty('height', '', 'important');
      html.style.setProperty('overflow-y', 'auto', 'important');
      body.style.setProperty('overflow', '', 'important');
      body.style.setProperty('height', '', 'important');
      body.style.setProperty('position', 'relative', 'important');
      body.style.setProperty('width', '', 'important');
      body.style.setProperty('top', '', 'important');
      body.style.setProperty('left', '', 'important');
      body.style.setProperty('right', '', 'important');
      body.style.setProperty('overflow-y', 'auto', 'important');
    } else {
      // Disable scrolling on all other pages (including dashboard)
      html.classList.add('no-scroll');
      body.classList.add('no-scroll');
      html.style.setProperty('overflow', 'hidden', 'important');
      html.style.setProperty('height', '100vh', 'important');
      html.style.setProperty('overflow-y', 'hidden', 'important');
      body.style.setProperty('overflow', 'hidden', 'important');
      body.style.setProperty('height', '100vh', 'important');
      body.style.setProperty('position', 'fixed', 'important');
      body.style.setProperty('width', '100%', 'important');
      body.style.setProperty('top', '0', 'important');
      body.style.setProperty('left', '0', 'important');
      body.style.setProperty('right', '0', 'important');
      body.style.setProperty('overflow-y', 'hidden', 'important');
    }
  }
  
  // Apply immediately on mount
  onMount(() => {
    updateScrollLock();
    setTimeout(() => updateScrollLock(), 10);
    setTimeout(() => updateScrollLock(), 50);
    setTimeout(() => updateScrollLock(), 100);
    setTimeout(() => updateScrollLock(), 200);
  });
  
  // Update reactively when route changes - check pathname directly
  $: if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    const path = $page.url.pathname || window.location.pathname || '/';
    const isOrg = path.includes('org');
    updateScrollLock();
  }
</script>

<svelte:head>
  <title>SocialQ</title>

  <!-- iOS-friendly viewport; remove maximum-scale/user-scalable if you want pinch-zoom -->
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no"
  />

  <!-- Your existing global CSS from /static/style.css (loads alongside Tailwind) -->
  <link rel="stylesheet" href="/style.css" />
</svelte:head>

<svelte:body />

{#if !hideHeader}
  <Header user={data?.user} />
{/if}

<slot />

<style>
  /* Disable scrolling only on personal pages - MUST be very specific */
  :global(html.no-scroll),
  :global(html.no-scroll body),
  :global(body.no-scroll) {
    overflow: hidden !important;
    overflow-x: hidden !important;
    overflow-y: hidden !important;
  }
  
  :global(html.no-scroll) {
    height: 100vh !important;
    position: relative !important;
  }
  
  :global(body.no-scroll) {
    height: 100vh !important;
    position: fixed !important;
    width: 100% !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
  }
  
  /* DO NOT add scrolling rules for pages without no-scroll - let inline styles handle it */
</style>
