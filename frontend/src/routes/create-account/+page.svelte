<script>
  import { goto } from '$app/navigation';

  let username = '';
  let password = '';
  let error = '';
  let loading = false;

  async function handleCreate(e) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
    const API_BASE = import.meta.env.VITE_API_BASE ?? '';
    const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // send/receive cookie
        body: JSON.stringify({ username, password })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.ok || data.success)) {
        goto('/login?created=1');
      } else {
        error = data.error || 'Registration failed';
      }
    } catch (_) {
      error = 'Network error';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Create Account • SocialQ</title>
</svelte:head>

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
    transition: border-color .2s, box-shadow .2s;
    box-sizing: border-box;
  }
  .input::placeholder{ color:#9ca3af; }
  .input:focus{
    border-color:#4f46e5;
    box-shadow:0 0 0 4px rgba(79,70,229,.15);
  }

  .btn{
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

  .muted{ margin-top:8px; font-size:13px; color:#6b7280; }
  .error{ margin-top:10px; color:#b91c1c; font-weight:700; }
</style>

<!-- blobs -->
<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="auth-wrap">
  <div class="card">
    <h2 class="title">Create Account</h2>

    <form on:submit={handleCreate} autocomplete="on">
      <input class="input" type="text" bind:value={username} placeholder="Username" required />
      <input class="input" type="password" bind:value={password} placeholder="Password" required />
      <button type="submit" class="btn primary" disabled={loading}>
        {loading ? 'Creating…' : 'Create'}
      </button>
    </form>

    {#if error}<div class="error">{error}</div>{/if}

    <p class="muted">Have an account already?</p>
    <button class="btn" type="button" on:click={() => goto('/login')}>Back to Login</button>
  </div>
</div>
