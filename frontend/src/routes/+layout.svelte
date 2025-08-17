<!-- src/routes/+layout.svelte -->
<script>
  import { page } from '$app/stores';
  import Header from '$lib/components/Header.svelte';

  export let data; // { user } from +layout.ts

  function norm(p) {
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p.toLowerCase();
  }

  $: path = norm($page.url.pathname);
  const HIDE = new Set(['/', '/login', '/create-account']);
  $: hideHeader = HIDE.has(path);
</script>

<svelte:head>
  <title>SocialQ</title>

  <!-- Favicons (put these files in /static) -->
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" sizes="any" href="/favicon.ico" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

  <!-- Global styles -->
  <link rel="stylesheet" href="/static/style.css" />
</svelte:head>

{#if !hideHeader}
  <Header user={data?.user} />
{/if}

<slot />
