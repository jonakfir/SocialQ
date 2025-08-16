<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';

  let username = '';
  let password = '';
  let error = '';

  async function handleLogin(e: Event) {
    e.preventDefault();
    error = '';

    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Login failed');

      localStorage.setItem('username', data?.user?.username ?? username);
      if (data?.user?.id != null) localStorage.setItem('userId', String(data.user.id));

      goto('/dashboard');
    } catch (err) {
      console.error(err);
      error = err?.message ?? 'Network error';
    }
  }

  function goCreate() { goto('/create-account'); }
</script>

<style>
  .blobs { position: fixed; inset: 0; pointer-events: none; }
  .auth-wrap{
    position: fixed;      /* fill the viewport regardless of page height */
    inset: 0;             /* top right bottom left = 0 */
    display: grid;
    place-items: center;  /* center both axes */
    padding: 24px;
    z-index: 1;           /* keep above the blobs */
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
  <div class="card">
    <h2 class="title">Login</h2>

    <!-- use the correctly named handler -->
    <form on:submit={handleLogin} autocomplete="on">
      <input class="input" type="text" bind:value={username} placeholder="Username" required />
      <input class="input" type="password" bind:value={password} placeholder="Password" required />
      <button type="submit" class="btn primary">Log In</button>
    </form>

    {#if error}
      <div class="error">{error}</div>
    {/if}

    <p class="muted">No account yet?</p>
    <!-- navigate with goto to avoid any form quirks -->
    <button class="btn" type="button" on:click={goCreate}>Create Account</button>
  </div>
</div>
