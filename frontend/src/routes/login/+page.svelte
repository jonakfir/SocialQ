<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';

  let email = '';
  let password = '';
  let error = '';

  function goCreate(){ goto('/create-account'); }
  function goHome(){ goto('/'); }

  // tilt setup
  let cardEl: HTMLDivElement | null = null;
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

  async function handleLogin(e: Event) {
    e.preventDefault();
    error = '';

    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // ensure JSON
        credentials: 'include',                           // keep cookie sessions
        body: JSON.stringify({ email: email.trim(), password })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.ok || data.user)) {
        const u = data.user?.email ?? email;
        const id = data.user?.id ?? null;
        localStorage.setItem('email', u);
        if (id != null) localStorage.setItem('userId', String(id));
        goto('/dashboard');
      } else {
        error = data.error || `Login failed (HTTP ${res.status})`;
      }
    } catch {
      error = 'Network error';
    }
  }
</script>

<style>
  .blobs { position: fixed; inset: 0; pointer-events: none; }

  .auth-wrap{
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    z-index: 1;
    perspective: 1000px; /* depth for tilt */
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

    /* tilt */
    position: relative;
    transform-style: preserve-3d;
    transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
    transition: transform .12s ease, box-shadow .2s ease;
  }

  /* glare */
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

  .title {
    font-size: 3.9rem;
    margin-bottom: 30px;
    font-family: 'Georgia', serif;
    color: white;
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
    display: block; width: 100%; padding: 12px 16px; border-radius: 9999px;
    font-weight: 800; font-size: 16px; cursor: pointer; border: 2px solid #111;
    background: #fff; color: #111; transition: transform .05s ease, filter .2s ease, background .2s ease;
    box-sizing: border-box;
  }
  .btn + .btn { margin-top: 10px; }
  .btn:hover { filter: brightness(1.03); }
  .btn:active { transform: translateY(1px); }
  .btn.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }

  .muted { margin-top: 8px; font-size: 13px; color: #6b7280; }
  .error { margin-top: 10px; color: #b91c1c; font-weight: 700; }
</style>

<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="auth-wrap">
  <div
    class="card"
    bind:this={cardEl}
    on:mousemove={handleTilt}
    on:mouseleave={resetTilt}
  >
    <h2 class="title">Login</h2>

    <form on:submit={handleLogin} autocomplete="on">
      <input class="input" type="email" bind:value={email} placeholder="Email" required />
      <input class="input" type="password" bind:value={password} placeholder="Password" required />
      <button type="submit" class="btn primary">Log In</button>
    </form>

    {#if error}<div class="error">{error}</div>{/if}

    <p class="muted">No account yet?</p>
    <button class="btn" type="button" on:click={goCreate}>Create Account</button>
    <button class="btn" type="button" on:click={goHome}>Back to Home</button>
  </div>
</div>
