<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import { onMount } from 'svelte';

  let email = '';
  let password = '';
  let error = '';
  let loading = false;
  let showPassword = false;

  async function handleLogin() {
    if (!email || !password) {
      error = 'Please enter both email and password';
      return;
    }

    loading = true;
    error = '';

    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      // Check response status first
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Login failed' }));
        error = errorData.error || `Login failed (${response.status})`;
        loading = false;
        return;
      }

      const data = await response.json();

      if (data.ok && data.user) {
        const userRole = data.user.role;
        console.log('[Login] User role:', userRole, 'Email:', data.user.email);
        
        loading = false;
        
        let redirectUrl = '/dashboard';
        if (userRole === 'admin') {
          console.log('[Login] Redirecting to admin page');
          redirectUrl = '/admin/users';
        } else if (userRole === 'org_admin' || userRole === 'organization') {
          console.log('[Login] Redirecting to org admin page');
          redirectUrl = data.user.organizationId 
            ? `/org/${data.user.organizationId}/dashboard`
            : '/org';
        } else {
          console.log('[Login] Redirecting to dashboard');
          redirectUrl = '/dashboard';
        }
        
        // Use SvelteKit's goto for proper client-side routing
        console.log('[Login] Redirecting to:', redirectUrl);
        // Small delay to ensure cookies are set
        await new Promise(resolve => setTimeout(resolve, 100));
        await goto(redirectUrl, { replaceState: true, invalidateAll: true });
        return;
      } else {
        error = data.error || 'Login failed';
        loading = false;
      }
    } catch (err: any) {
      console.error('[Login] Error:', err);
      error = err.message || 'Login failed. Please try again.';
      loading = false;
    }
  }

  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }
</script>

<div class="login-container">
  <div class="login-card">
    <h1>Login</h1>
    
    {#if error}
      <div class="error-message">{error}</div>
    {/if}

    <form on:submit|preventDefault={handleLogin} on:submit|stopPropagation>
      <div class="input-group">
        <input
          type="email"
          placeholder="Email"
          bind:value={email}
          required
          disabled={loading}
        />
      </div>

      <div class="input-group">
        {#if showPassword}
          <input
            type="text"
            placeholder="Password"
            bind:value={password}
            required
            disabled={loading}
          />
        {:else}
          <input
            type="password"
            placeholder="Password"
            bind:value={password}
            required
            disabled={loading}
          />
        {/if}
        <button
          type="button"
          class="password-toggle"
          on:click={togglePasswordVisibility}
          aria-label="Toggle password visibility"
        >
          {showPassword ? '👁️' : '👁️‍🗨️'}
        </button>
      </div>

      <button type="submit" class="login-btn" disabled={loading}>
        {loading ? 'Logging in...' : 'Log In'}
      </button>
    </form>

    <p class="no-account">No account yet?</p>
    <div class="button-group">
      <button class="secondary-btn" on:click={() => goto('/create-account')}>
        Create Account
      </button>
      <button class="secondary-btn" on:click={() => goto('/')}>
        Back to Home
      </button>
    </div>
  </div>
</div>

<style>
  .login-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #00f2fe 100%);
    background-size: 400% 400%;
    animation: gradient 15s ease infinite;
    padding: 20px;
  }

  @keyframes gradient {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  .login-card {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 20px;
    padding: 40px;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  h1 {
    text-align: center;
    margin-bottom: 30px;
    color: #333;
    font-size: 2.5em;
    font-weight: bold;
  }

  .error-message {
    background: #fee;
    color: #c33;
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 20px;
    text-align: center;
  }

  .input-group {
    position: relative;
    margin-bottom: 20px;
  }

  .input-group input {
    width: 100%;
    padding: 12px;
    border: 2px solid #ddd;
    border-radius: 8px;
    font-size: 16px;
    box-sizing: border-box;
  }

  .input-group input:focus {
    outline: none;
    border-color: #667eea;
  }

  .password-toggle {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    font-size: 20px;
    padding: 5px;
  }

  .login-btn {
    width: 100%;
    padding: 12px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    margin-bottom: 20px;
    transition: transform 0.2s;
  }

  .login-btn:hover:not(:disabled) {
    transform: translateY(-2px);
  }

  .login-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .no-account {
    text-align: center;
    color: #666;
    margin-bottom: 15px;
  }

  .button-group {
    display: flex;
    gap: 10px;
  }

  .secondary-btn {
    flex: 1;
    padding: 10px;
    background: white;
    color: #333;
    border: 2px solid #333;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .secondary-btn:hover {
    background: #333;
    color: white;
  }
</style>

