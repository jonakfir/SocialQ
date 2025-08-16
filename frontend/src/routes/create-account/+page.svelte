<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import { fade, fly } from 'svelte/transition';

  let username = '';
  let password = '';
  let error = '';
  let loading = false;
  let cardEl: HTMLDivElement | null = null;

  // Button ripple action
  function ripple(node: HTMLElement) {
    function onClick(e: MouseEvent) {
      const rect = node.getBoundingClientRect();
      const d = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - d / 2;
      const y = e.clientY - rect.top - d / 2;
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.width = span.style.height = `${d}px`;
      span.style.left = `${x}px`;
      span.style.top = `${y}px`;
      node.appendChild(span);
      setTimeout(() => span.remove(), 600);
    }
    node.addEventListener('click', onClick);
    return { destroy: () => node.removeEventListener('click', onClick) };
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    error = '';
    const u = username.trim();
    const p = password; // allow spaces if they want
    if (!u || !p) {
      error = 'Please enter a username and password.';
      bump();
      return;
    }

    loading = true;
    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.ok || data.success)) {
        goto('/login?created=1');
      } else {
        error = data.error || `Registration failed (HTTP ${res.status})`;
        bump();
      }
    } catch {
      error = 'Network error';
      bump();
    } finally {
      loading = false;
    }
  }

  function bump() {
    if (!cardEl) return;
    cardEl.classList.remove('shake');
    // force reflow to restart animation
    void cardEl.offsetWidth;
    cardEl.classList.add('shake');
  }
</script>

<svelte:head>
  <title>Create Account • SocialQ</title>
</svelte:head>

<style>
  .blobs { position: fixed; inset: 0; pointer-events: none; }

  .auth-wrap{
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    z-index: 1;
  }

  .card{
    width: 100%;
    max-width: 440px;
    padding: 32px;
    background: rgba(255,255,255,0.2);
    backdrop-filter: blur(18px);
    border-radius: 18px;
    box-shadow: 0 14px 48px rgba(0,0,0,.18);
    text-align: center;
    box-sizing: border-box;
    will-change: transform, opacity;
  }

  .title{
    font-size: 3.2rem;
    margin-bottom: 30px;
    font-family: 'Georgia', serif;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 10px 10px rgba(0,0,0,0.4);
  }

  form{
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 6px;
    padding: 0 1rem;
    box-sizing: border-box;
  }

  .input{
    width: 100%;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1.5px solid rgba(17,17,17,.18);
    background: rgba(255,255,255,.9);
    font-size: 16px;
    outline: none;
    transition: border-color .2s, box-shadow .2s, transform .12s ease;
    box-sizing: border-box;
  }
  .input::placeholder{ color:#9ca3af; }
  .input:focus{
    border-color:#4f46e5;
    box-shadow:0 0 0 4px rgba(79,70,229,.15);
    transform: translateY(-1px);
  }

  .btn{
    position: relative;           /* ripple container */
    overflow: hidden;             /* clip ripple */
    display:block;
    width:100%;
    padding:12px 16px;
    border-radius:9999px;
    font-weight:800;
    font-size:16px;
    cursor:pointer;
    border:2px solid #111;
    background:#fff;
    color:#111;
    transition:transform .05s ease, filter .2s ease, background .2s ease;
    box-sizing:border-box;
  }
  .btn:hover{ filter:brightness(1.03); }
  .btn:active{ transform:translateY(1px); }

  .btn.primary{
    background:#4f46e5;
    border-color:#4f46e5;
    color:#fff;
  }
  .btn[disabled]{
    opacity: .75;
    cursor: not-allowed;
  }

  /* Ripple */
  .ripple{
    position:absolute;
    border-radius:50%;
    transform: scale(0);
    animation: ripple .6s ease-out forwards;
    background: rgba(255,255,255,.55);
    pointer-events:none;
  }
  @keyframes ripple{
    to { transform: scale(4); opacity: 0; }
  }

  /* Spinner inside primary button */
  .spinner{
    width: 16px;
    height: 16px;
    margin-right: 8px;
    border: 2px solid transparent;
    border-top-color: #fff;
    border-right-color: #fff;
    border-radius: 50%;
    display: inline-block;
    vertical-align: -3px;
    animation: spin .6s linear infinite;
  }
  @keyframes spin{ to { transform: rotate(360deg); } }

  .muted{ margin-top:8px; font-size:13px; color:#6b7280; }
  .error{ margin-top:10px; color:#b91c1c; font-weight:700; min-height: 1.2em; }

  /* Shake on error */
  .shake{
    animation: shake .5s ease;
  }
  @keyframes shake{
    0%,100%{ transform: translateX(0); }
    20%{ transform: translateX(-6px); }
    40%{ transform: translateX(6px); }
    60%{ transform: translateX(-4px); }
    80%{ transform: translateX(4px); }
  }
</style>

<!-- blobs -->
<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="auth-wrap">
  <div class="card" bind:this={cardEl} in:fly={{ y: 28, duration: 280, opacity: 0.25 }}>
    <h2 class="title" in:fade={{ duration: 220 }}>Create Account</h2>

    <form on:submit={handleCreate} autocomplete="on" aria-busy={loading}>
      <input class="input" type="text" bind:value={username} placeholder="Username" required />
      <input class="input" type="password" bind:value={password} placeholder="Password" required />

      <button
        use:ripple
        type="submit"
        class="btn primary"
        disabled={loading}
      >
        {#if loading}<span class="spinner" aria-hidden="true"></span>Creating…{:else}Create{/if}
      </button>
    </form>

    {#if error}<div class="error">{error}</div>{/if}

    <p class="muted">Have an account already?</p>
    <button use:ripple class="btn" type="button" on:click={() => goto('/login')}>Back to Login</button>
  </div>
</div>
