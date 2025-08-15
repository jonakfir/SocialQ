<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let loading = true;
  let saving = false;
  let error = '';

  let username = '';
  let newPassword = '';

  async function loadMe() {
    try {
      const res = await fetch('http://localhost:4000/auth/me', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!data?.user) {
        return goto('/login');
      }
      username = data.user.username;
    } catch {
      error = 'Could not load profile.';
    } finally {
      loading = false;
    }
  }
  onMount(loadMe);

  async function save(e) {
    e.preventDefault();
    error = '';
    saving = true;
    try {
      const res = await fetch('http://localhost:4000/auth/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username,
          password: newPassword || undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.ok || data.success)) {
        goto('/profile');
      } else {
        error = data.error || `Update failed (status ${res.status})`;
      }
    } catch (_) {
      error = 'Network error.';
    } finally {
      saving = false;
    }
  }
</script>

<style>
  .blobs { position: fixed; inset: 0; pointer-events: none; z-index: 1; }

  .container {
    display: grid;
    place-items: center;
    min-height: 100vh;
    width: 100vw;
    position: relative;
    z-index: 2;
    padding: 24px;
  }

  .edit-box {
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(20px);
    padding: 32px 24px;
    border-radius: 20px;
    width: min(360px, 92vw);
    text-align: center;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
    z-index: 3;
  }

  h2 {
    font-size: 2rem;
    margin-bottom: 16px;
    font-family: 'Georgia', serif;
    color: white;
    -webkit-text-stroke: 2px rgba(0, 0, 0, 0.5);
    text-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
  }

  form {
    display: grid;
    gap: 10px;
    width: 100%;
    margin: 0;
    padding: 0;
  }

  input[type="text"],
  input[type="password"] {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border: 1.5px solid rgba(17, 17, 17, 0.18);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.95);
    font-size: 15px;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  input:focus {
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
  }

  .btn {
    display: block;
    width: 100%;
    padding: 12px 14px;
    border-radius: 9999px;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    border: 2px solid #111;
    background: #fff;
    color: #111;
    transition: transform 0.05s, filter 0.2s, background 0.2s;
    box-sizing: border-box;
  }

  .btn:hover {
    filter: brightness(1.03);
  }

  .btn:active {
    transform: translateY(1px);
  }

  .primary {
    background: #4f46e5;
    border-color: #4f46e5;
    color: #fff;
  }

  .outline {
    background: transparent;
    border-color: #111;
    color: #111;
  }

  .error {
    margin-top: 8px;
    color: #b91c1c;
    font-weight: 700;
  }

  .row {
    display: grid;
    gap: 8px;
  }
</style>

<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="container">
  <div class="edit-box">
    <h2>Edit Profile</h2>

    {#if loading}
      <div>Loading…</div>
    {:else}
      <form on:submit={save}>
        <div class="row">
          <input type="text" bind:value={username} placeholder="Username" required />
          <input type="password" bind:value={newPassword} placeholder="New Password (optional)" />
        </div>
        <button class="btn primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>

      {#if error}<div class="error">{error}</div>{/if}

      <button class="btn outline" on:click={() => goto('/profile')}>Cancel</button>
    {/if}
  </div>
</div>
