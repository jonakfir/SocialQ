<script lang="ts">
  export let confirmMessage: string;
  export let onConfirm: () => void | Promise<void>;
  export let disabled = false;
  export let loading = false;
  export let title = 'Delete';

  async function handleClick() {
    if (disabled || loading) return;
    if (!confirm(confirmMessage)) return;
    await onConfirm();
  }
</script>

<button
  type="button"
  class="trash-delete-btn"
  class:loading
  {disabled}
  {title}
  on:click={handleClick}
  aria-label={title}
>
  {#if loading}
    <span class="trash-delete-spinner" aria-hidden="true">⏳</span>
  {:else}
    <svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  {/if}
</button>

<style>
  .trash-delete-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border-radius: 50%;
    border: 2px solid rgba(156, 163, 175, 0.8);
    background: rgba(243, 244, 246, 0.9);
    color: #6b7280;
    cursor: pointer;
    transition: color 0.2s, border-color 0.2s, background 0.2s, transform 0.2s;
    flex-shrink: 0;
  }
  .trash-delete-btn:hover:not(:disabled):not(.loading) {
    color: #dc2626;
    border-color: rgba(220, 38, 38, 0.8);
    background: rgba(254, 226, 226, 0.95);
    transform: scale(1.08);
  }
  .trash-delete-btn:disabled,
  .trash-delete-btn.loading {
    opacity: 0.7;
    cursor: not-allowed;
  }
  .trash-icon {
    display: block;
  }
  .trash-delete-spinner {
    font-size: 1.1rem;
  }
</style>
