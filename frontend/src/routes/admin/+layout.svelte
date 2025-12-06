<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { apiFetch } from '$lib/api';
  import '../../app.css';
  
  export let data: { user: any; isAdmin: boolean };
  
  const navItems = [
    { label: 'Dashboard', path: '/admin' },
    { label: 'Users', path: '/admin/users' },
    { label: 'Organizations', path: '/admin/organizations' },
    { label: 'Analytics', path: '/admin/analytics' }
  ];
</script>

<svelte:head>
  <title>Admin Dashboard - SocialQ</title>
</svelte:head>

<!-- Background blobs -->
<div class="blob blob1"></div>
<div class="blob blob2"></div>
<div class="blob blob3"></div>
<div class="blob blob4"></div>
<div class="blob blob5"></div>
<div class="blob blob6"></div>
<div class="blob blob7"></div>
<div class="blob blob8"></div>
<div class="blob blob9"></div>
<div class="blob blob10"></div>
<div class="blob blob11"></div>
<div class="blob blob12"></div>

<div class="admin-layout">
  <header class="admin-header">
    <div class="admin-header-content">
      <h1 class="admin-title">Admin Panel</h1>
      <nav class="admin-nav">
        {#each navItems as item}
          <a 
            href={item.path} 
            class="admin-nav-link"
            class:active={$page.url.pathname === item.path || ($page.url.pathname.startsWith(item.path + '/') && item.path !== '/admin')}
          >
            {item.label}
          </a>
        {/each}
      </nav>
      <div class="admin-header-actions">
        <span class="admin-user">{data.user?.email || 'Admin'}</span>
        <button class="admin-logout-btn" on:click={async () => {
          // Clear auth and redirect to login
          try {
            await apiFetch('/auth/logout', { method: 'POST' });
          } catch {
            // Ignore errors
          }
          localStorage.removeItem('mock_auth_user');
          localStorage.removeItem('email');
          localStorage.removeItem('userId');
          goto('/login');
        }}>Logout</button>
      </div>
    </div>
  </header>

  <main class="admin-main">
    <slot />
  </main>
</div>

<style>
  @import '/static/style.css';

  :global(body) {
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden;
  }

  :global(html) {
    margin: 0 !important;
    padding: 0 !important;
  }

  .admin-layout {
    min-height: 100vh;
    min-height: 100dvh;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    background: radial-gradient(70% 50% at 20% 10%, rgba(79,70,229,.14), transparent 60%),
                radial-gradient(60% 50% at 80% 30%, rgba(34,211,238,.12), transparent 60%),
                rgba(0,0,0,.22);
    margin: 0;
    padding: 0;
  }

  .admin-header {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    backdrop-filter: blur(22px) saturate(140%);
    border-bottom: 1px solid rgba(255,255,255,.3);
    box-shadow: 0 8px 20px rgba(79,70,229,.16), 0 2px 0 rgba(255,255,255,.85) inset;
    position: sticky;
    top: 0;
    z-index: 1000;
  }

  .admin-header-content {
    max-width: 1600px;
    margin: 0 auto;
    padding: 0.75rem 1.5rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .admin-title {
    font-family: Georgia, serif;
    font-size: clamp(1.25rem, 3vw, 1.75rem);
    font-weight: 800;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,.45);
    text-shadow: 0 10px 14px rgba(0,0,0,.35);
    margin: 0;
  }

  .admin-nav {
    display: flex;
    gap: 0.25rem;
    flex: 1;
  }

  .admin-nav-link {
    padding: 0.6rem 1.2rem;
    border-radius: 9999px;
    text-decoration: none;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 700;
    font-size: 0.9rem;
    font-family: ui-sans-serif, system-ui, -apple-system, "Inter", "SF Pro Text", "Segoe UI", Roboto, Arial, sans-serif;
    letter-spacing: 0.25px;
    transition: all 0.2s ease;
    border: 2px solid transparent;
    text-shadow: 0 2px 4px rgba(0,0,0,.2);
  }

  .admin-nav-link:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border-color: rgba(255, 255, 255, 0.3);
  }

  .admin-nav-link.active {
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    color: white;
    box-shadow: 0 4px 12px rgba(79,70,229,.35);
    border-color: rgba(255,255,255,.3);
  }

  .admin-header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .admin-user {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 600;
    font-size: 0.875rem;
    text-shadow: 0 2px 4px rgba(0,0,0,.2);
  }

  .admin-logout-btn {
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    border: 2px solid rgba(239, 68, 68, 0.5);
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(10px);
    color: white;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    text-shadow: 0 2px 4px rgba(0,0,0,.2);
  }

  .admin-logout-btn:hover {
    background: #ef4444;
    color: white;
    border-color: #ef4444;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
    transform: translateY(-1px);
  }

  .admin-main {
    flex: 1;
    padding: 1.25rem 1.5rem;
    max-width: 1600px;
    width: 100%;
    margin: 0 auto;
    position: relative;
    z-index: 1;
  }

  @media (max-width: 768px) {
    .admin-header-content {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }

    .admin-nav {
      flex-wrap: wrap;
    }

    .admin-header-actions {
      width: 100%;
      justify-content: space-between;
    }
  }
</style>
