<!-- src/routes/+layout.svelte -->
<script>
  import { page } from '$app/stores';
  import Header from '$lib/components/Header.svelte';

  export let data;

  const HIDE = new Set(['/', '/login', '/create-account']);
  $: hideHeader = HIDE.has(($page.url.pathname || '/').replace(/\/$/, '').toLowerCase());
</script>

<svelte:head>
  <title>SocialQ</title>

  <!-- Favicons (must exist in /static) -->
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=1" />
  <link rel="icon" sizes="any" href="/favicon.ico?v=1" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=1" />

  <!-- Your global CSS served from /static/style.css -> /style.css -->
  <link rel="stylesheet" href="/style.css" />
</svelte:head>

{#if !hideHeader}
  <Header user={data?.user} />
{/if}

<slot />
