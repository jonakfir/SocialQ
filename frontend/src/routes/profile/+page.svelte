<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import { onMount } from 'svelte';

  // Accept what the backend actually returns: { id, email, darkMode }
  export let data: { user: { id: number; email?: string; darkMode?: boolean } | null; collages: any[] };

  $: user = data?.user ?? { id: 0, email: '', darkMode: false };
  let darkMode = user?.darkMode ?? false;
  let saving = false;

  // Update darkMode when user data changes
  $: if (user && user.darkMode !== undefined) {
    darkMode = user.darkMode;
  }

  // Display name = email (fallback to blank to avoid "undefined")
  $: displayEmail = (user?.email ?? '').toString();

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

  async function toggleDarkMode() {
    console.log('toggleDarkMode called', { saving, userId: user?.id, currentDarkMode: darkMode });
    
    if (saving) {
      console.log('Already saving, ignoring click');
      return;
    }
    
    if (!user?.id || user.id === 0) {
      console.warn('User not loaded yet, trying anyway...');
      // Try to proceed anyway - maybe user will load
    }
    
    saving = true;
    const newDarkMode = !darkMode;
    console.log('Toggling dark mode to:', newDarkMode);
    
    try {
      const res = await apiFetch('/auth/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ darkMode: newDarkMode })
      });
      
      console.log('API response status:', res.status, res.ok);
      
      const responseData = await res.json().catch((err) => {
        console.error('Failed to parse response:', err);
        return {};
      });
      
      console.log('API response data:', responseData);
      
      if (res.ok && responseData.ok) {
        // Update the user data with the new darkMode value
        if (data?.user) {
          data.user.darkMode = newDarkMode;
        }
        // Update local state
        darkMode = newDarkMode;
        // Apply dark mode immediately
        applyDarkMode(newDarkMode);
        console.log('✅ Dark mode updated successfully to:', newDarkMode);
      } else {
        console.error('❌ Failed to update dark mode:', responseData);
        alert('Failed to update dark mode. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error updating dark mode:', error);
      alert('Error updating dark mode: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      saving = false;
    }
  }

  function applyDarkMode(enabled: boolean) {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (enabled) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }

  // Apply dark mode on mount
  onMount(() => {
    applyDarkMode(darkMode);
  });

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
    background: var(--bg-card);
    backdrop-filter: blur(20px);
    padding: 40px;
    border-radius: 20px;
    width: min(450px, 92vw);
    text-align: center;
    box-shadow: 0 4px 30px var(--shadow);
    z-index: 3;
    transition: background-color 0.3s ease, box-shadow 0.3s ease;
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
  .user-info{ font-size:18px; color:var(--text-primary); margin-bottom:20px; transition: color 0.3s ease; }
  .dark-mode-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 90%;
    max-width: 280px;
    margin: 20px auto;
    padding: 15px;
    background: var(--bg-card-hover);
    border: 2px solid var(--text-primary);
    border-radius: 40px;
    cursor: pointer;
    transition: background .2s ease, transform .05s ease, border-color 0.3s ease, opacity 0.2s ease;
    pointer-events: auto;
    position: relative;
    z-index: 10;
    user-select: none;
  }
  .dark-mode-toggle:hover:not(.disabled) {
    background: var(--bg-card);
  }
  .dark-mode-toggle:active:not(.disabled) {
    transform: scale(0.98);
  }
  .dark-mode-toggle.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }
  .dark-mode-toggle:focus {
    outline: 2px solid var(--brand, #4f46e5);
    outline-offset: 2px;
  }
  .dark-mode-label {
    font-size: 18px;
    font-weight: 800;
    color: var(--text-primary);
    transition: color 0.3s ease;
  }
  .toggle-switch {
    position: relative;
    width: 50px;
    height: 26px;
    background: #ccc;
    border-radius: 13px;
    transition: background .3s ease;
  }
  .toggle-switch.active {
    background: #4f46e5;
  }
  .toggle-switch::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    transition: transform .3s ease;
  }
  .toggle-switch.active::after {
    transform: translateX(24px);
  }
  .btn{
    display:block; width:90%; max-width:280px; padding:15px;
    margin:10px auto; font-size:18px; font-weight:800; color:var(--text-primary);
    background:var(--bg-card-hover); border:2px solid var(--text-primary); border-radius:40px;
    text-decoration:none; text-align:center; cursor:pointer;
    transition: background .2s ease, color .2s ease, transform .05s ease, border-color 0.3s ease;
  }
  .btn:hover{ background:#4f46e5; color:#fff; border-color:#4f46e5; }
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

    <!-- Dark Mode Toggle -->
    <div 
      class="dark-mode-toggle" 
      class:disabled={saving || !user?.id}
      on:click={toggleDarkMode}
      on:keydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleDarkMode();
        }
      }}
      role="button" 
      tabindex={saving || !user?.id ? -1 : 0}
      aria-label="Toggle dark mode"
      aria-pressed={darkMode}
      aria-disabled={saving || !user?.id}
    >
      <span class="dark-mode-label">Dark Mode</span>
      <div class="toggle-switch" class:active={darkMode}></div>
    </div>

    <!-- Use buttons that call goto() to avoid any full reload/SSR redirect quirks -->
    <button class="btn" on:click={goEditProfile}>Edit Profile</button>
    <button class="btn" on:click={goDashboard}>Back to Dashboard</button>
    <button class="btn" on:click={() => goto('/saved-photos')}>Saved Photos</button>
    <button class="btn" on:click={logout}>Logout</button>
  </div>
</div>
