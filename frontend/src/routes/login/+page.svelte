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