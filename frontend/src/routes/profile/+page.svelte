<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let user = null;     // { id, username } | null
  let loading = true;
  let error = '';

  async function loadUser() {
    try {
      const res = await fetch('http://localhost:4000/auth/me', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      user = data?.user ?? null;
      if (!user) goto('/login');
    } catch {
      error = 'Could not load profile.';
    } finally {
      loading = false;
    }
  }

  onMount(loadUser);

  async function logout() {
    try {
      await fetch('http://localhost:4000/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    goto('/login');
  }
</script>

<style>
  .container{
    display:flex; justify-content:center; align-items:center;
    min-height:100vh; width:100vw; position:relative; z-index:2;
  }
  .profile-box{
    background: rgba(255,255,255,0.6);
    backdrop-filter: blur(20px);
    padding: 40px;
    border-radius: 20px;
    width: min(450px, 92vw);
    text-align: center;
    box-shadow: 0 4px 30px rgba(0,0,0,0.2);
    z-index: 3;
  }
  .profile-pic {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    border: 4px solid white;
    display: grid;
    place-items: center;
    font-size: 46px;
    font-weight: 900;
    margin: 0 auto 20px;

    /* New colorful gradient */
    background: linear-gradient(135deg,
      rgba(255,182,193,1) 0%,
      rgba(255,223,186,1) 25%,
      rgba(186,255,201,1) 50%,
      rgba(186,225,255,1) 75%,
      rgba(218,186,255,1) 100%);
    background-size: 300% 300%;
    animation: gradientMove 8s ease infinite;
    color: white; /* Text color */
  }

  /* Smoothly animate the gradient for extra effect */
  @keyframes gradientMove {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  h2{
    font-family: 'Georgia', serif; font-size:2.5rem; color:white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 4px 10px rgba(0,0,0,0.4); margin-bottom: 15px;
  }
  .user-info{ font-size:18px; color:black; margin-bottom:20px; }
  .btn{
    display:block; width:90%; max-width:280px; padding:15px;
    margin:10px auto; font-size:18px; font-weight:800; color:black;
    background:#fff; border:2px solid #111; border-radius:40px;
    text-decoration:none; text-align:center; cursor:pointer;
    transition: background .2s ease, color .2s ease, transform .05s ease;
  }
  .btn:hover{ background:#4f46e5; color:#fff; }
  .blobs{ position:absolute; inset:0; pointer-events:none; z-index:1; }
</style>

<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="container">
  <div class="profile-box">
    {#if loading}
      <div>Loading…</div>
    {:else if user}
      <div class="profile-pic">{user.username?.[0]?.toUpperCase() || '?'}</div>
      <h2>{user.username}</h2>
      <div class="user-info">
        <p><strong>User ID:</strong> {user.id}</p>
      </div>
      <a href="/edit-profile" class="btn">Edit Profile</a>
      <a href="/dashboard" class="btn">Back to Dashboard</a>
      <button class="btn" on:click={logout}>Logout</button>
    {:else}
      <div class="user-info">You’re not signed in.</div>
      <button class="btn" on:click={() => goto('/login')}>Go to Login</button>
    {/if}
  </div>
</div>
