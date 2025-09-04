<!-- src/routes/+layout.svelte -->
<script>
  import { page } from '$app/stores';
  import Header from '$lib/components/Header.svelte';

  // 👇 import your global Tailwind file (at src/app.css)
  import '../app.css';

  export let data;

  // Hide header on these routes
  const HIDE = new Set(['', '/', '/login', '/create-account', '/create_account']);
  $: hideHeader = HIDE.has(($page.url.pathname || '/').replace(/\/$/, '').toLowerCase());
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

{#if !hideHeader}
  <Header user={data?.user} />
{/if}

<slot />
