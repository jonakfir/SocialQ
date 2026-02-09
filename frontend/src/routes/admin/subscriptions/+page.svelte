<script lang="ts">
  import { invalidate } from '$app/navigation';
  import { apiFetch } from '$lib/api';

  export let data: { users: any[]; total: number };

  let users = data.users || [];
  $: if (data.users) {
    users = data.users;
  }

  let loading = false;
  let updatingAccessLevel: Record<string, boolean> = {};
  let updatingTrialEnd: Record<string, boolean> = {};
  let editingTrialEndFor: string | null = null;
  let trialEndInput: Record<string, string> = {};

  const DEFAULT_TRIAL_DAYS = 14;

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
    } catch {
      return iso;
    }
  }

  function getTrialTimeLeft(trialEndsAt: string | null | undefined): { text: string; expired: boolean } {
    if (!trialEndsAt) return { text: '—', expired: false };
    try {
      const end = new Date(trialEndsAt);
      const now = new Date();
      if (end.getTime() <= now.getTime()) {
        return { text: 'Expired', expired: true };
      }
      const ms = end.getTime() - now.getTime();
      const days = Math.floor(ms / (24 * 60 * 60 * 1000));
      const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      if (days > 0) return { text: `${days} day${days !== 1 ? 's' : ''} left`, expired: false };
      if (hours > 0) return { text: `${hours} hour${hours !== 1 ? 's' : ''} left`, expired: false };
      const mins = Math.floor(ms / (60 * 1000));
      return { text: `${mins} min left`, expired: false };
    } catch {
      return { text: '—', expired: false };
    }
  }

  function defaultTrialEndDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + DEFAULT_TRIAL_DAYS);
    return d.toISOString().slice(0, 16);
  }

  async function updateAccessLevel(userId: string, newAccessLevel: 'pro' | 'free_trial' | 'none') {
    if (updatingAccessLevel[userId]) return;
    const user = users.find((u) => u.id === userId);
    const original = user?.accessLevel ?? 'none';
    updatingAccessLevel[userId] = true;
    let trialEndsAt: string | null | undefined = undefined;
    if (newAccessLevel === 'free_trial') {
      const existing = user?.trialEndsAt;
      if (existing) {
        try {
          const end = new Date(existing);
          if (end.getTime() > Date.now()) trialEndsAt = existing;
        } catch {}
      }
      if (trialEndsAt == null) {
        const d = new Date();
        d.setDate(d.getDate() + DEFAULT_TRIAL_DAYS);
        trialEndsAt = d.toISOString();
      }
    } else {
      trialEndsAt = null;
    }
    try {
      const body: { accessLevel: string; trialEndsAt?: string | null } = { accessLevel: newAccessLevel };
      if (trialEndsAt !== undefined) body.trialEndsAt = trialEndsAt;
      const response = await apiFetch(`/api/admin/users/${userId}/access_level`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (result.ok) {
        const idx = users.findIndex((u) => u.id === userId);
        if (idx !== -1) {
          users[idx].accessLevel = newAccessLevel;
          users[idx].trialEndsAt = trialEndsAt ?? null;
          users = [...users];
        }
        await invalidate('/admin/subscriptions');
      } else {
        alert(result.error || 'Failed to update access level');
      }
    } catch (error) {
      console.error('Failed to update access level:', error);
      alert('Failed to update access level. Please try again.');
    } finally {
      updatingAccessLevel[userId] = false;
    }
  }

  function startEditTrialEnd(user: any) {
    editingTrialEndFor = user.id;
    const existing = user.trialEndsAt;
    if (existing) {
      try {
        const d = new Date(existing);
        trialEndInput[user.id] = d.toISOString().slice(0, 16);
      } catch {
        trialEndInput[user.id] = defaultTrialEndDate();
      }
    } else {
      trialEndInput[user.id] = defaultTrialEndDate();
    }
    trialEndInput = { ...trialEndInput };
  }

  function cancelEditTrialEnd() {
    editingTrialEndFor = null;
    trialEndInput = {};
  }

  async function saveTrialEnd(userId: string) {
    if (updatingTrialEnd[userId]) return;
    const raw = trialEndInput[userId];
    if (!raw) {
      cancelEditTrialEnd();
      return;
    }
    const trialEndsAt = new Date(raw).toISOString();
    if (isNaN(new Date(raw).getTime())) {
      alert('Invalid date');
      return;
    }
    updatingTrialEnd[userId] = true;
    try {
      const response = await apiFetch(`/api/admin/users/${userId}/access_level`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessLevel: 'free_trial', trialEndsAt })
      });
      const result = await response.json();
      if (result.ok) {
        const idx = users.findIndex((u) => u.id === userId);
        if (idx !== -1) {
          users[idx].trialEndsAt = trialEndsAt;
          users = [...users];
        }
        editingTrialEndFor = null;
        trialEndInput = {};
        await invalidate('/admin/subscriptions');
      } else {
        alert(result.error || 'Failed to update trial end date');
      }
    } catch (error) {
      console.error('Failed to update trial end:', error);
      alert('Failed to update trial end date.');
    } finally {
      updatingTrialEnd[userId] = false;
    }
  }

  async function refresh() {
    loading = true;
    try {
      const res = await apiFetch('/api/admin/stats/users?limit=1000&offset=0');
      const d = await res.json();
      if (d.ok) {
        users = d.users || [];
      }
    } catch (e) {
      console.error('Refresh failed', e);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Subscriptions - Admin - SocialQ</title>
</svelte:head>

<div class="subscriptions-page">
  <div class="page-header">
    <h1>Subscriptions</h1>
    <button class="refresh-btn" on:click={refresh} disabled={loading}>
      {loading ? 'Refreshing...' : '🔄 Refresh'}
    </button>
  </div>
  <p class="page-description">
    View and change each user's subscription/access level. For Free Trial users, you can see time left and set or extend the trial end date.
  </p>

  <div class="table-container">
    <table class="subs-table">
      <thead>
        <tr>
          <th>Email</th>
          <th>Access Level</th>
          <th>Trial ends / Time left</th>
          <th>Set trial end</th>
        </tr>
      </thead>
      <tbody>
        {#each users as user (user.id)}
          {@const timeLeft = user.accessLevel === 'free_trial' ? getTrialTimeLeft(user.trialEndsAt) : { text: '—', expired: false }}
          <tr class:expired={timeLeft.expired}>
            <td class="email-cell">{user.username}</td>
            <td class="level-cell">
              <select
                value={user.accessLevel ?? 'none'}
                on:change={(e) => {
                  const v = e.currentTarget.value;
                  if ((v === 'pro' || v === 'free_trial' || v === 'none') && v !== (user.accessLevel ?? 'none')) {
                    updateAccessLevel(user.id, v);
                  }
                }}
                disabled={updatingAccessLevel[user.id]}
                class="level-select"
                class:pro={user.accessLevel === 'pro'}
                class:free-trial={user.accessLevel === 'free_trial'}
              >
                <option value="none">Daily Free Play</option>
                <option value="free_trial">Free Trial</option>
                <option value="pro">Pro</option>
              </select>
              {#if updatingAccessLevel[user.id]}
                <span class="updating">Updating...</span>
              {/if}
            </td>
            <td class="trial-cell">
              {#if user.accessLevel === 'free_trial'}
                <span class="time-left" class:expired={timeLeft.expired}>{timeLeft.text}</span>
                {#if user.trialEndsAt}
                  <span class="trial-date" title={user.trialEndsAt}>{formatDate(user.trialEndsAt)}</span>
                {/if}
              {:else}
                —
              {/if}
            </td>
            <td class="set-trial-cell">
              {#if user.accessLevel === 'free_trial'}
                {#if editingTrialEndFor === user.id}
                  <div class="trial-edit">
                    <input
                      type="datetime-local"
                      bind:value={trialEndInput[user.id]}
                      class="trial-input"
                    />
                    <button
                      class="save-btn"
                      on:click={() => saveTrialEnd(user.id)}
                      disabled={updatingTrialEnd[user.id]}
                    >
                      {updatingTrialEnd[user.id] ? 'Saving...' : 'Save'}
                    </button>
                    <button class="cancel-btn" on:click={cancelEditTrialEnd} disabled={updatingTrialEnd[user.id]}>
                      Cancel
                    </button>
                  </div>
                {:else}
                  <button class="set-trial-btn" on:click={() => startEditTrialEnd(user)}>
                    Set / extend trial end
                  </button>
                {/if}
              {:else}
                —
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if users.length === 0}
    <div class="empty">No users to show. Make sure you have access to the backend user list.</div>
  {:else}
    <div class="count">Showing {users.length} user{users.length !== 1 ? 's' : ''}</div>
  {/if}
</div>

<style>
  .subscriptions-page {
    max-width: 1200px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .page-header h1 {
    font-family: Georgia, serif;
    font-size: clamp(1.5rem, 4vw, 2.5rem);
    font-weight: 800;
    color: white;
    -webkit-text-stroke: 2px rgba(0, 0, 0, 0.45);
    text-shadow: 0 10px 14px rgba(0, 0, 0, 0.35);
    margin: 0;
  }

  .refresh-btn {
    padding: 0.5rem 1rem;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9));
    color: #4f46e5;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .refresh-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(79, 70, 229, 0.5);
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .page-description {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.9rem;
    margin: 0 0 1.25rem 0;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .table-container {
    background: linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.28),
        rgba(255, 255, 255, 0.2)
      ),
      radial-gradient(120% 120% at 0% 0%, rgba(79, 70, 229, 0.18), transparent 60%),
      radial-gradient(120% 120% at 100% 0%, rgba(34, 211, 238, 0.18), transparent 60%);
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 24px;
    padding: 0;
    box-shadow: 0 24px 68px rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(22px) saturate(140%);
    overflow-x: auto;
  }

  .subs-table {
    width: 100%;
    border-collapse: collapse;
  }

  .subs-table th {
    text-align: left;
    padding: 0.875rem 1rem;
    font-weight: 700;
    font-size: 0.75rem;
    color: #4f46e5;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid rgba(79, 70, 229, 0.2);
    background: linear-gradient(135deg, rgba(79, 70, 229, 0.05), rgba(34, 211, 238, 0.05));
  }

  .subs-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    font-size: 0.875rem;
    vertical-align: middle;
  }

  .subs-table tbody tr:hover {
    background: rgba(79, 70, 229, 0.06);
  }

  .subs-table tbody tr.expired {
    background: rgba(239, 68, 68, 0.08);
  }

  .email-cell {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .level-select {
    padding: 0.4rem 0.75rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.95);
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .level-select.pro {
    background: linear-gradient(135deg, #d1fae5, #a7f3d0);
    border-color: #059669;
    color: #065f46;
  }

  .level-select.free-trial {
    background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
    border-color: #4f46e5;
    color: #3730a3;
  }

  .level-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .updating {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.8);
    margin-left: 0.5rem;
    font-style: italic;
  }

  .trial-cell {
    color: rgba(255, 255, 255, 0.9);
  }

  .trial-cell .time-left {
    display: inline-block;
    margin-right: 0.5rem;
    font-weight: 600;
  }

  .trial-cell .time-left.expired {
    color: #fca5a5;
    font-weight: 700;
  }

  .trial-cell .trial-date {
    font-size: 0.8rem;
    opacity: 0.85;
  }

  .set-trial-btn {
    padding: 0.35rem 0.65rem;
    border-radius: 6px;
    border: 1px solid rgba(79, 70, 229, 0.5);
    background: rgba(255, 255, 255, 0.2);
    color: white;
    font-weight: 600;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .set-trial-btn:hover {
    background: rgba(79, 70, 229, 0.4);
    border-color: #4f46e5;
  }

  .trial-edit {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .trial-input {
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    border: 1px solid rgba(79, 70, 229, 0.3);
    background: rgba(255, 255, 255, 0.95);
    color: #111;
    font-size: 0.85rem;
    min-width: 180px;
  }

  .trial-input:focus {
    outline: none;
    border-color: #4f46e5;
  }

  .save-btn,
  .cancel-btn {
    padding: 0.35rem 0.65rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .save-btn {
    border: 1px solid #059669;
    background: linear-gradient(135deg, #d1fae5, #a7f3d0);
    color: #065f46;
  }

  .save-btn:hover:not(:disabled) {
    background: #a7f3d0;
  }

  .cancel-btn {
    border: 1px solid #6b7280;
    background: rgba(255, 255, 255, 0.3);
    color: rgba(255, 255, 255, 0.95);
  }

  .cancel-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }

  .save-btn:disabled,
  .cancel-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .empty {
    text-align: center;
    padding: 2rem;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.9rem;
    margin-top: 1rem;
  }

  .count {
    margin-top: 0.75rem;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.8);
  }
</style>
