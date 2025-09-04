<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import { fade, fly } from 'svelte/transition';

  let email = '';
  let password = '';
  let error = '';
  let loading = false;
  let cardEl: HTMLDivElement | null = null;

  // terms and modal
  let accepted = false;
  let termsOpen = false;

  // motion and pointer checks for tilt
  let motionOK = true;
  let finePointer = true;
  if (typeof window !== 'undefined') {
    motionOK    = matchMedia('(prefers-reduced-motion: no-preference)').matches;
    finePointer = matchMedia('(pointer: fine)').matches;
  }

  let rafId = 0;
  function handleTilt(e: MouseEvent) {
    if (!cardEl || !motionOK || !finePointer) return;
    const r = cardEl.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;

    const ry = (px - 0.5) * 5;
    const rx = (0.5 - py) * 3;
    const gx = px * 100;
    const gy = py * 100;

    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        cardEl!.style.setProperty('--rx', rx.toFixed(2) + 'deg');
        cardEl!.style.setProperty('--ry', ry.toFixed(2) + 'deg');
        cardEl!.style.setProperty('--gx', gx.toFixed(1) + '%');
        cardEl!.style.setProperty('--gy', gy.toFixed(1) + '%');
        rafId = 0;
      });
    }
  }

  function resetTilt() {
    if (!cardEl) return;
    cardEl.style.setProperty('--rx', '0deg');
    cardEl.style.setProperty('--ry', '0deg');
  }

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
    const u = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emailCheck =  emailRegex.test(u);

    const p = password;
    if (!u || !p) {
      error = 'Please enter an email and password.';
      bump();
      return;
    }
    if (!emailCheck) {
      error = 'Please enter a valid email.';
      bump();
      return;
    }
    if (!accepted) {
      error = 'Please accept the Terms and Conditions.';
      bump();
      return;
    }

    loading = true;
    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: u, password: p })
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
    perspective: 1000px; /* tilt depth */
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
    transform-style: preserve-3d;
    transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
    transition: transform .12s ease, box-shadow .2s ease;
    position: relative;
  }

  /* soft glare */
  .card::before{
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: radial-gradient(300px circle at var(--gx,50%) var(--gy,50%), rgba(255,255,255,.28), transparent 60%);
    opacity: 0;
    transition: opacity .18s ease;
  }
  .card:hover::before{ opacity: 1; }
  .card:hover{ box-shadow: 0 18px 56px rgba(0,0,0,.28); }

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

  .terms{
    display:flex;
    align-items:center;
    text-align:left;
    gap:10px;
    font-size: 14px;
    color:#111;
    background: rgba(255,255,255,.85);
    border: 1px solid rgba(17,17,17,.12);
    padding: 10px 12px;
    border-radius: 12px;
  }
  .terms input{ width:18px; height:18px; }
  .terms a{ color:#4f46e5; text-decoration: underline; cursor: pointer; }

  .btn{
    position: relative;
    overflow: hidden;
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
  .btn[disabled]{ opacity:.75; cursor:not-allowed; }

  /* Ripple */
  .ripple{
    position:absolute;
    border-radius:50%;
    transform: scale(0);
    animation: ripple .6s ease-out forwards;
    background: rgba(255,255,255,.55);
    pointer-events:none;
  }
  @keyframes ripple{ to { transform: scale(4); opacity: 0; } }

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
  .shake{ animation: shake .5s ease; }
  @keyframes shake{
    0%,100%{ transform: translateX(0); }
    20%{ transform: translateX(-6px); }
    40%{ transform: translateX(6px); }
    60%{ transform: translateX(-4px); }
    80%{ transform: translateX(4px); }
  }

  /* modal */
  .modal-backdrop{
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.35);
    display: grid;
    place-items: center;
    z-index: 3;
  }
  .modal{
    width: min(560px, 92vw);
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,.35);
    padding: 20px;
    text-align: left;
  }
  .modal h3{ margin: 0 0 8px; }
  .modal-body{ color:#111; line-height:1.5; min-height: 120px; }
  .modal-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top: 14px; }
</style>

<!-- blobs -->
<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="auth-wrap">
  <div
    class="card"
    bind:this={cardEl}
    in:fly={{ y: 28, duration: 280, opacity: 0.25 }}
    on:mousemove={handleTilt}
    on:mouseleave={resetTilt}
  >
    <h2 class="title" in:fade={{ duration: 220 }}>Create Account</h2>

    <form on:submit={handleCreate} autocomplete="on" aria-busy={loading}>
      <input class="input" type="text" bind:value={email} placeholder="Email" required />
      <input class="input" type="password" bind:value={password} placeholder="Password" required />

      <label class="terms">
        <input type="checkbox" bind:checked={accepted} aria-label="Accept Terms and Conditions" />
        <span>
          I agree to the
          <a href="#" on:click|preventDefault={() => (termsOpen = true)}>Terms and Conditions</a>
        </span>
      </label>

      <button
        use:ripple
        type="submit"
        class="btn primary"
        disabled={loading || !accepted}
      >
        {#if loading}<span class="spinner" aria-hidden="true"></span>Creating…{:else}Create{/if}
      </button>
    </form>

    {#if error}<div class="error">{error}</div>{/if}

    <p class="muted">Have an account already?</p>
    <button use:ripple class="btn" type="button" on:click={() => goto('/login')}>Back to Login</button>
  </div>
</div>

{#if termsOpen}
  <div class="modal-backdrop" transition:fade on:click={() => (termsOpen = false)}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Terms and Conditions" on:click|stopPropagation>
      <h3>Terms and Conditions</h3>
      <div class="modal-body">test</div>
      <div class="modal-actions">
        <button class="btn" type="button" on:click={() => (termsOpen = false)}>Close</button>
      </div>
    </div>
  </div>
{/if}
