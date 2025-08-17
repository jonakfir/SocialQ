<!-- src/routes/+layout.svelte -->
<script>
  import { page } from '$app/stores';
  import Header from '$lib/components/Header.svelte';

  export let data; // <- get { user } from +layout.ts

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
  <link rel="stylesheet" href="/style.css" />
</svelte:head>

{#if !hideHeader}
  <!-- pass the user down -->
  <Header user={data.user} />
{/if}

<slot />

