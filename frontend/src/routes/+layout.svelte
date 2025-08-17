<!-- src/routes/+layout.svelte -->
<script>
  import { page } from '$app/stores';
  import Header from '$lib/components/Header.svelte';

  // populated by +layout.ts (e.g., { user })
  export let data;

  function norm(p) {
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p.toLowerCase();
  }

  $: path = norm($page.url.pathname);
  // hide header on these routes
  const HIDE = new Set(['/', '/login', '/create-account']);
  $: hideHeader = HIDE.has(path);
</script>

<svelte:head>
  <title>SocialQ</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />

  <!-- Favicons -->
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="alternate icon" href="/favicon.ico" sizes="any" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#4f46e5" />
  <meta name="theme-color" content="#ffffff" />

  <!-- Global styles (lives in /static/style.css) -->
  <link rel="stylesheet" href="/static/style.css" />
</svelte:head>

{#if !hideHeader}
  <Header user={data?.user} />
{/if}

<slot />
