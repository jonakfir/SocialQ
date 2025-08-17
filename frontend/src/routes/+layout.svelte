<!-- src/routes/+layout.svelte -->
<script>
  import { page } from '$app/stores';
  import Header from '$lib/components/Header.svelte';

  export let data;

  const HIDE = new Set(['', '/', '/login', '/create-account']);
  $: hideHeader = HIDE.has(($page.url.pathname || '/').replace(/\/$/, '').toLowerCase());
</script>

<svelte:head>
  <title>SocialQ</title>
  <!-- Your global CSS served from /static/style.css -> /style.css -->
  <link rel="stylesheet" href="/style.css" />
</svelte:head>

{#if !hideHeader}
  <Header user={data?.user} />
{/if}

<slot />
