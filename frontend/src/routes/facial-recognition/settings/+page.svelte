<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  onMount(() => {
    const level = $page.url.searchParams.get('level') || '1';
    const difficulty = ['1', '2', '3', '4', '5'].includes(level) ? level : '1';
    goto(`/facial-recognition/quiz/${difficulty}`);
  });
</script>

<svelte:head>
  <title>Facial Recognition – SocialQ</title>
</svelte:head>

<p>Redirecting to quiz…</p>
