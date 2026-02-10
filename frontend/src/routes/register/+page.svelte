<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  type RegOption = 'myself' | 'my_child' | 'my_student' | 'someone_else';
  let selectedOption: RegOption | null = null;
  let appear = false;

  onMount(() => { appear = true; });

  function selectOption(option: RegOption) {
    selectedOption = option;
    setTimeout(() => goto('/create-account?type=' + option), 300);
  }

  function backToHome() {
    goto('/');
  }

  function goLogin() {
    goto('/login');
  }
</script>

<svelte:head>
  <title>Register • AboutFace</title>
</svelte:head>

<style>
  /* Full viewport; background art shows through from body (web.png) */
  .register-stage {
    position: fixed;
    inset: 0;
    z-index: 10;
    min-height: 100vh;
    display: grid;
    place-items: center;
    overflow: auto;
    /* Subtle overlay so background art (faces) stays visible */
    background: linear-gradient(
      180deg,
      rgba(15, 20, 46, 0.35) 0%,
      rgba(26, 31, 71, 0.45) 50%,
      rgba(15, 20, 46, 0.35) 100%
    );
    padding: clamp(24px, 5vw, 48px);
  }

  .card {
    width: min(480px, 92vw);
    padding: clamp(28px, 6vw, 48px);
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.55);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
    text-align: center;
    border: 1px solid rgba(255, 255, 255, 0.4);
    opacity: 0;
    transform: translateY(12px);
    transition: opacity 0.45s ease, transform 0.45s ease;
  }
  .card.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .brand {
    font-size: clamp(1.75rem, 5vw, 2.25rem);
    font-weight: 700;
    font-family: Georgia, 'Times New Roman', serif;
    color: white;
    margin: 0 0 6px;
    letter-spacing: -0.02em;
    -webkit-text-stroke: 1.5px rgba(0, 0, 0, 0.35);
    text-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
  }

  .question {
    font-size: clamp(1rem, 2.5vw, 1.125rem);
    font-weight: 600;
    color: #374151;
    margin: 0 0 24px;
    line-height: 1.35;
  }

  .bub-img {
    width: 88px;
    height: 88px;
    object-fit: contain;
    margin: 0 auto 28px;
    display: block;
    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    margin-bottom: 20px;
  }

  .option-btn {
    display: block;
    width: 100%;
    height: 52px;
    border: none;
    border-radius: 14px;
    font-size: 1.0625rem;
    font-weight: 700;
    color: white;
    cursor: pointer;
    background: #4f46e5;
    border: 2px solid #4f46e5;
    box-shadow: 0 6px 20px rgba(79, 70, 229, 0.35);
    transition: filter 0.2s, transform 0.1s, box-shadow 0.2s;
  }
  .option-btn:hover {
    filter: brightness(1.08);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(79, 70, 229, 0.45);
  }
  .option-btn:active {
    transform: translateY(0) scale(0.98);
  }

  .links {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }
  .link-btn {
    padding: 12px 20px;
    background: transparent;
    border: 1.5px solid rgba(55, 65, 81, 0.4);
    border-radius: 9999px;
    color: #374151;
    cursor: pointer;
    font-size: 0.9375rem;
    font-weight: 600;
    width: 100%;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }
  .link-btn:hover {
    background: rgba(55, 65, 81, 0.08);
    border-color: rgba(55, 65, 81, 0.6);
  }
  .link-btn.primary-link {
    border-color: rgba(79, 70, 229, 0.5);
    color: #4f46e5;
  }
  .link-btn.primary-link:hover {
    background: rgba(79, 70, 229, 0.1);
    border-color: #4f46e5;
  }
</style>

<div class="register-stage">
  <div class="card" class:visible={appear}>
    <h1 class="brand">AboutFace</h1>
    <p class="question">Who needs help with facial cues?</p>

    <img src="/BUB1A.png" alt="" class="bub-img" width="88" height="88" />

    <div class="options">
      <button type="button" class="option-btn" on:click={() => selectOption('myself')}>Myself</button>
      <button type="button" class="option-btn" on:click={() => selectOption('my_child')}>My Child</button>
      <button type="button" class="option-btn" on:click={() => selectOption('my_student')}>My Student / Patient</button>
      <button type="button" class="option-btn" on:click={() => selectOption('someone_else')}>Someone Else</button>
    </div>

    <div class="links">
      <button type="button" class="link-btn primary-link" on:click={goLogin}>
        Already have an account? Log in
      </button>
      <button type="button" class="link-btn" on:click={backToHome}>Back to Home</button>
    </div>
  </div>
</div>
