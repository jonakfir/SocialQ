<!-- src/routes/+layout.svelte -->
<script>
  import { page } from '$app/stores';
  import Header from '$lib/components/Header.svelte';

  function norm(p) {
    // strip trailing slash except root, lowercase for safety
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p.toLowerCase();
  }

  $: path = norm($page.url.pathname);
  const HIDE = new Set(['/', '/login', '/create-account']);
  $: hideHeader = HIDE.has(path);
</script>

<style>
  html, body {
    margin: 0;
    padding: 0;
    overflow: hidden;  /* keeps the blob background tidy */
    height: 100vh;
    width: 100vw;
  }
</style>

<svelte:head>
  <title>SocialQ</title>
  <link rel="stylesheet" href="/style.css" />
</svelte:head>

{#if !hideHeader}
  <Header />
{/if}

<slot />
