<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';

  // Accept what the backend actually returns: { id, email }
  export let data: { user: { id: number; email?: string } | null; collages: any[] };

  const user = data?.user ?? { id: 0, email: '' };

  // Display name = email (fallback to blank to avoid "undefined")
  const displayEmail = (user.email ?? '').toString();

  // Avatar initial = first letter of the local-part of the email
  function initialFromEmail(email: string): string {
    if (!email) return '?';
    const local = email.includes('@') ? email.split('@')[0] : email;
    const ch = local.trim().charAt(0);
    return ch ? ch.toUpperCase() : '?';
  }
  const initial = initialFromEmail(displayEmail);

  // Explicit navigation so SvelteKit handles it client-side (no SSR bounce)
  function goEditProfile() {
    goto('/edit-profile');
  }
  function goDashboard() {
    goto('/dashboard');
  }

  async function logout() {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    try {
      localStorage.removeItem('username'); // legacy keys if you had them
      localStorage.removeItem('userId');
      localStorage.removeItem('userEmail');
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
    width: 120px; height: 120px; border-radius: 50%;
    border: 4px solid white; display: grid; place-items: center;
    font-size: 46px; font-weight: 900; margin: 0 auto 20px;
    background: linear-gradient(135deg,
      rgba(255,182,193,1) 0%,
      rgba(255,223,186,1) 25%,
      rgba(186,255,201,1) 50%,
      rgba(186,225,255,1) 75%,
      rgba(218,186,255,1) 100%);
    background-size: 300% 300%;
    animation: gradientMove 8s ease infinite;
    color: white;
  }
  @keyframes gradientMove {
    0% { background-position: 0% 50% }
    50% { background-position: 100% 50% }
    100% { background-position: 0% 50% }
  }
  h2{
    font-family: 'Georgia', serif; font-size:2.0rem; color:white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 4px 10px rgba(0,0,0,0.4); margin-bottom: 15px;
    word-break: break-all; /* long emails won’t overflow */
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

<!-- blobs -->
<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="container">
  <div class="profile-box">
    <div class="profile-pic">{initial}</div>
    <h2>{displayEmail || '—'}</h2>
    <div class="user-info">
      <p><strong>User ID:</strong> {user.id}</p>
    </div>

    <!-- Use buttons that call goto() to avoid any full reload/SSR redirect quirks -->
    <button class="btn" on:click={goEditProfile}>Edit Profile</button>
    <button class="btn" on:click={goDashboard}>Back to Dashboard</button>
    <button class="btn" on:click={() => goto('/saved-photos')}>Saved Photos</button>
    <button class="btn" on:click={logout}>Logout</button>
  </div>
</div>
