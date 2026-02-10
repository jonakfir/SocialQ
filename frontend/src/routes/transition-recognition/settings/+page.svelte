<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  onMount(() => {
    const level = $page.url.searchParams.get('level')?.toLowerCase();
    const mode = level === 'challenge' ? 'Challenge' : 'Normal';
    goto(`/transition-recognition/quiz/${mode}`);
  });
</script>

<svelte:head>
  <title>Transition Recognition – SocialQ</title>
</svelte:head>

<p>Redirecting to quiz…</p>
