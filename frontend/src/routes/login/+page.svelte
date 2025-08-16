<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import { fly, fade } from 'svelte/transition';

  let username = '';
  let password = '';
  let error = '';
  let submitting = false;
  let shake = false;

  function goCreate(){ goto('/create-account'); }

  // ripple helper for buttons
  function ripple(e: MouseEvent) {
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    btn.style.setProperty('--rx', `${x}px`);
    btn.style.setProperty('--ry', `${y}px`);
    btn.classList.remove('rippling');
    // restart animation
    void btn.offsetWidth;
    btn.classList.add('rippling');
  }

  async function handleLogin(e: Event) {
    e.preventDefault();
    error = '';
    submitting = true;

    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        const u = data.user?.username ?? username;
        const id = data.user?.id ?? null;
        try {
          localStorage.setItem('username', u);
          if (id != null) localStorage.setItem('userId', String(id));
        } catch {}
        goto('/dashboard');
      } else {
        error = data?.error ?? `Login failed (HTTP ${res.status})`;
        // shake the card briefly
        shake = true;
        setTimeout(() => (shake = false), 500);
      }
    } catch {
      error = 'Network error. Please try again.';
      shake = true;
      setTimeout(() => (shake = false), 500);
    } finally {
      submitting = false;
    }
  }
</script>

<style>
  .blobs { position: fixed; inset: 0; pointer-events: none; }

  .auth-wrap{
    position: fixed; inset: 0;
    display: grid; place-items: center;
    padding: 24px; z-index: 1;
  }

  .card {
    width: 100%; max-width: 440px; padding: 32px;
    background: rgba(255,255,255,0.2);
    backdrop-filter: blur(18px);
    border-radius: 18px;
    box-shadow: 0 14px 48px rgba(0,0,0,.18);
    text-align: center; box-sizing: border-box;
    transform-origin: 50% 40%;
  }

  /* shake on error */
  .card.shake {
    animation: shake 500ms cubic-bezier(.36,.07,.19,.97);
  }
  @keyframes shake {
    10%, 90% { transform: translateX(-1px); }
    20%, 80% { transform: translateX(2px); }
    30%, 50%, 70% { transform: translateX(-4px); }
    40%, 60% { transform: translateX(4px); }
  }

  .title {
    font-size: 3.9rem; margin-bottom: 30px;
    font-family: 'Georgia', serif; color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 10px 10px rgba(0,0,0,0.4);
  }

  form { display: flex; flex-direction: column; gap: 14px; margin-top: 6px; padding: 0 1rem; box-sizing: border-box; }

  .input {
    width: 100%; padding: 12px 14px; border-radius: 12px;
    border: 1.5px solid rgba(17,17,17,.18); background: rgba(255,255,255,.9);
    font-size: 16px; outline: none; transition: border-color .2s, box-shadow .2s; box-sizing: border-box;
  }
  .input::placeholder { color: #9ca3af; }
  .input:focus { border-color: #4f46e5; box-shadow: 0 0 0 4px rgba(79,70,229,.15); }

  .btn {
    position: relative;
    display: block; width: 100%; padding: 12px 16px; border-radius: 9999px;
    font-weight: 800; font-size: 16px; cursor: pointer; border: 2px solid #111;
    background: #fff; color: #111; transition: transform .05s ease, filter .2s ease, background .2s ease;
    box-sizing: border-box; overflow: hidden;
    --rx: 50%; --ry: 50%; /* ripple origin (set by JS) */
  }
  .btn:hover { filter: brightness(1.03); }
  .btn:active { transform: translateY(1px); }
  .btn.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }

  /* spinner while submitting */
  .btn[aria-busy="true"] {
    pointer-events: none; opacity: .85;
  }
  .btn[aria-busy="true"] .spinner {
    display: inline-block;
  }
  .spinner {
    display: none;
    width: 1em; height: 1em;
    border: 2px solid rgba(255,255,255,.45);
    border-top-color: #fff;
    border-radius: 50%;
    margin-left: 8px;
    vertical-align: -2px;
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ripple effect (uses --rx/--ry) */
  .btn::after {
    content: "";
    position: absolute; left: var(--rx); top: var(--ry);
    width: 0; height: 0; pointer-events: none;
    background: radial-gradient(circle, rgba(255,255,255,.45) 10%, transparent 60%);
    transform: translate(-50%, -50%);
    border-radius: 50%;
    opacity: 0;
  }
  .btn.rippling::after {
    animation: ripple .5s ease-out;
  }
  @keyframes ripple {
    0% { width: 0; height: 0; opacity: .6; }
    100% { width: 360px; height: 360px; opacity: 0; }
  }

  .muted { margin-top: 8px; font-size: 13px; color: #6b7280; }
  .error { margin-top: 10px; color: #b91c1c; font-weight: 700; }
</style>

<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="auth-wrap">
  <div class="card {shake ? 'shake' : ''}" in:fade={{ duration: 220 }}>
    <h2 class="title">Login</h2>

    <form on:submit={handleLogin} autocomplete="on">
      <input class="input" type="text" bind:value={username} placeholder="Username" required />
      <input class="input" type="password" bind:value={password} placeholder="Password" required />
      <button
        type="submit"
        class="btn primary"
        aria-busy={submitting}
        on:click|preventDefault={ripple}
        on:mousedown|preventDefault
        on:mouseup
        >
        {submitting ? 'Logging in' : 'Log In'}
        <span class="spinner" aria-hidden="true"></span>
      </button>
    </form>

    {#if error}
      <div class="error" aria-live="polite">{error}</div>
    {/if}

    <p class="muted">No account yet?</p>
    <button
      class="btn"
      type="button"
      on:click={(e) => { ripple(e); goCreate(); }}
    >
      Create Account
    </button>
  </div>
</div>
