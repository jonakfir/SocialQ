<script lang="ts">
  export let show = false;
  export let onComplete: (() => void) | null = null;
  export let loop = false;

  let videoEl: HTMLVideoElement;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  $: if (show && videoEl) {
    videoEl.currentTime = 0;
    videoEl.play().catch(() => {});
    // Fallback: navigate after 8s if video never ends (e.g. loading error)
    if (fallbackTimer) clearTimeout(fallbackTimer);
    if (!loop && onComplete) {
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        onComplete?.();
      }, 8000);
    }
  }

  $: if (!show && fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }

  function handleEnded() {
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    if (loop) {
      videoEl.currentTime = 0;
      videoEl.play().catch(() => {});
    } else {
      onComplete?.();
    }
  }

  function handleError() {
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    onComplete?.();
  }
</script>

{#if show}
  <div
    class="loading-overlay"
    role="presentation"
    aria-hidden="true"
  >
    <video
      bind:this={videoEl}
      class="loading-video"
      src="/loading-animation.mp4"
      muted
      playsinline
      onended={handleEnded}
      onerror={handleError}
    />
  </div>
{/if}

<style>
  .loading-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .loading-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
