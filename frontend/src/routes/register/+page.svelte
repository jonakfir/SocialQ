<script lang="ts">
  import { goto } from '$app/navigation';
  import { fade } from 'svelte/transition';

  let selectedOption: 'myself' | 'child' | 'someone-else' | null = null;
  let appear = false;

  function selectOption(option: 'myself' | 'child' | 'someone-else') {
    selectedOption = option;
    setTimeout(() => {
      if (option === 'myself' || option === 'child') {
        goto('/create-account?type=' + option);
      } else {
        // Someone else - email socialq
        window.location.href = 'mailto:info@social-q.net?subject=AboutFace Registration Request';
      }
    }, 300);
  }

  $: if (typeof window !== 'undefined') {
    appear = true;
  }
</script>

<svelte:head>
  <title>Register • AboutFace</title>
</svelte:head>

<style>
  @import '/static/style.css';

  .blobs { position: fixed; inset: 0; pointer-events: none; }

  .register-wrap {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    z-index: 1;
  }

  .card {
    width: 100%;
    max-width: 440px;
    padding: 32px;
    background: rgba(255,255,255,0.2);
    backdrop-filter: blur(18px);
    border-radius: 18px;
    box-shadow: 0 14px 48px rgba(0,0,0,.18);
    text-align: center;
    box-sizing: border-box;
  }

  .title {
    font-size: 3.2rem;
    margin-bottom: 30px;
    font-family: 'Georgia', serif;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 10px 10px rgba(0,0,0,0.4);
  }

  .question {
    font-size: 1.2rem;
    font-weight: 600;
    color: #111;
    margin-bottom: 24px;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .option-btn {
    display: block;
    width: 100%;
    padding: 16px 20px;
    border-radius: 9999px;
    font-weight: 800;
    font-size: 16px;
    cursor: pointer;
    border: 2px solid #4f46e5;
    background: #4f46e5;
    color: #fff;
    transition: transform .12s ease, filter .2s ease, box-shadow .2s ease;
    box-sizing: border-box;
  }
  .option-btn:hover {
    filter: brightness(1.05);
    box-shadow: 0 12px 32px rgba(79,70,229,.45);
    transform: translateY(-1px);
  }
  .option-btn:active {
    transform: translateY(0) scale(.98);
  }

  .back-btn {
    margin-top: 20px;
    padding: 10px 16px;
    background: transparent;
    border: 1px solid rgba(17,17,17,.2);
    border-radius: 9999px;
    color: #111;
    cursor: pointer;
    font-size: 14px;
    transition: background .2s ease;
  }
  .back-btn:hover {
    background: rgba(17,17,17,.05);
  }
</style>

<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="register-wrap">
  <div class="card" in:fade={{ duration: 280, opacity: 0.25 }}>
    <h2 class="title" in:fade={{ duration: 220 }}>Register</h2>
    <p class="question" in:fade={{ duration: 240, delay: 100 }}>Who are you Signing Up for?</p>
    
    <div class="options" in:fade={{ duration: 260, delay: 150 }}>
      <button class="option-btn" on:click={() => selectOption('myself')} in:fade={{ duration: 200, delay: 200 }}>
        Myself
      </button>
      <button class="option-btn" on:click={() => selectOption('child')} in:fade={{ duration: 200, delay: 250 }}>
        My Child
      </button>
      <button class="option-btn" on:click={() => selectOption('someone-else')} in:fade={{ duration: 200, delay: 300 }}>
        Someone Else
      </button>
    </div>

    <button class="back-btn" on:click={() => goto('/login')} in:fade={{ duration: 200, delay: 350 }}>
      Back to Login
    </button>
  </div>
</div>
