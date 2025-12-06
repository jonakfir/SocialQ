<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { apiFetch } from '$lib/api';

  let loading = true;
  let error: string | null = null;
  let members: Array<{ id: string; role: string; status: string; joinedAt: string; user: { id: string; username: string } }> = [];

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await apiFetch(`/api/organizations/${$page.params.orgId}/members`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load members');
      members = data.members || [];
    } catch (e: any) {
      error = e?.message || 'Failed to load members';
    } finally {
      loading = false;
    }
  }

  async function act(userId: string, action: 'approve'|'remove'|'promote'|'demote') {
    try {
      const res = await apiFetch(`/api/organizations/${$page.params.orgId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId, action })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Action failed');
      await load();
    } catch (e:any) {
      alert(e?.message || 'Action failed');
    }
  }

  onMount(load);
</script>

<div class="members-page">
  <h1>Manage Members</h1>
  {#if loading}
    <div class="card">Loading…</div>
  {:else if error}
    <div class="card error">{error}</div>
  {:else}
    <div class="card">
      <table class="table">
        <thead>
          <tr><th>User</th><th>Status</th><th>Role</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {#each members as m}
            <tr>
              <td>{m.user.username}</td>
              <td>{m.status}</td>
              <td>{m.role}</td>
              <td class="actions">
                {#if m.status === 'pending'}
                  <button on:click={() => act(m.user.id,'approve')}>Approve</button>
                {/if}
                {#if m.role === 'member' && m.status === 'approved'}
                  <button on:click={() => act(m.user.id,'promote')}>Promote</button>
                {:else if m.role === 'org_admin' && m.status === 'approved'}
                  <button on:click={() => act(m.user.id,'demote')}>Demote</button>
                {/if}
                {#if m.status !== 'removed'}
                  <button class="danger" on:click={() => act(m.user.id,'remove')}>Remove</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .members-page { max-width: 1100px; margin: 0 auto; padding: 1rem; }
  .card {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20));
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 16px;
    padding: 1rem;
  }
  .table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid rgba(0,0,0,.06); }
  .actions button { margin-right: .5rem; }
  .danger { color: #b91c1c; }
  h1 { font-size: 1.5rem; margin-bottom: .75rem; }
</style>


