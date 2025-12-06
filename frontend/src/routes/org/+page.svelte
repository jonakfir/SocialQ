<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';

  let loading = true;
  let organizations: Array<{ id: string; name: string; description?: string; status: string; memberCount?: number }> = [];
  let error: string | null = null;

  // create organization (for logged-in personal users)
  let creating = false;
  let createError: string = '';
  let orgName = '';
  let orgDesc = '';

  async function loadOrgs() {
    loading = true;
    try {
      const res = await apiFetch('/api/organizations?mine=1');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load organizations');
      const orgs = data.organizations || [];
      
      // Load member counts for each org
      const orgsWithCounts = await Promise.all(orgs.map(async (org: any) => {
        try {
          const membersRes = await apiFetch(`/api/organizations/${org.id}/members`);
          const membersData = await membersRes.json();
          if (membersData.ok) {
            const approvedCount = (membersData.members || []).filter((m: any) => m.status === 'approved').length;
            return { ...org, memberCount: approvedCount };
          }
        } catch (e) {
          console.error('Failed to load member count for org', org.id, e);
        }
        return { ...org, memberCount: 0 };
      }));
      
      organizations = orgsWithCounts;
    } catch (e: any) {
      error = e?.message || 'Failed to load organizations';
    } finally {
      loading = false;
    }
  }

  function openOrg(orgId: string) {
    goto(`/org/${orgId}/dashboard`);
  }

  async function createOrg() {
    createError = '';
    const name = (orgName || '').trim();
    if (!name) {
      createError = 'Organization name is required';
      return;
    }
    creating = true;
    try {
      const res = await apiFetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: (orgDesc || '').trim() || undefined })
      });
      const data = await res.json();
      if (!data.ok) {
        createError = data.error || 'Failed to create organization';
      } else {
        orgName = '';
        orgDesc = '';
        await loadOrgs();
        alert('Organization created and pending approval. You will see it listed below.');
      }
    } catch (e: any) {
      createError = e?.message || 'Failed to create organization';
    } finally {
      creating = false;
    }
  }

  onMount(loadOrgs);
</script>

<div class="org-hub">
  <h1>Your Organizations</h1>

  <div class="create-card">
    <h2>Create an Organization</h2>
    <div class="form">
      <input
        type="text"
        class="input"
        placeholder="Organization name"
        bind:value={orgName}
      />
      <input
        type="text"
        class="input"
        placeholder="Description (optional)"
        bind:value={orgDesc}
      />
      <button class="btn" on:click={createOrg} disabled={creating || !orgName.trim()}>
        {creating ? 'Creating…' : 'Create Organization'}
      </button>
    </div>
    {#if createError}<div class="error">{createError}</div>{/if}
    <div class="muted">An admin will need to approve your organization. Once approved, you’ll have an org portal similar to the admin dashboard where you can manage members and view stats.</div>
  </div>

  {#if loading}
    <div class="card">Loading organizations…</div>
  {:else if error}
    <div class="card error">{error}</div>
  {:else if organizations.length === 0}
    <div class="card">You don’t belong to any organizations yet.</div>
  {:else}
    <div class="grid">
      {#each organizations as org}
        <div class="card" on:click={() => openOrg(org.id)} tabindex="0" role="button">
          <h2>{org.name}</h2>
          {#if org.description}<p>{org.description}</p>{/if}
          <div class="meta">
            <div>Status: {org.status}</div>
            {#if org.memberCount !== undefined}
              <div style="margin-top: 0.5rem; font-weight: 600; color: #4f46e5;">Members: {org.memberCount}</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .org-hub { max-width: 1100px; margin: 0 auto; padding: 1rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px,1fr)); gap: 1rem; }
  .card {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20));
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 16px;
    padding: 1rem;
    cursor: pointer;
  }
  .card:hover { filter: brightness(1.05); }
  .error { color: #b91c1c; }
  h1 { font-size: 1.5rem; margin-bottom: .75rem; }
  h2 { margin: 0 0 .25rem 0; font-size: 1.05rem; }
  .meta { margin-top: .5rem; font-size: .85rem; color: #6b7280; }

  .create-card {
    background: linear-gradient(180deg, rgba(255,255,255,.90), rgba(255,255,255,.88));
    border: 1px solid rgba(255,255,255,.72);
    border-radius: 16px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .form { display: grid; grid-template-columns: 1fr 1fr auto; gap: .5rem; align-items: center; }
  .input {
    padding: .5rem .75rem;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: #fff;
  }
  .btn {
    padding: .6rem 1rem;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    color: #fff;
    font-weight: 700;
    cursor: pointer;
  }
  .muted { margin-top: .5rem; color: #6b7280; font-size: .85rem; }
</style>


