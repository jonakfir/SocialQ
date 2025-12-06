<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, invalidate } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import { page } from '$app/stores';
  
  export let data: { users: any[]; total: number; limit: number; offset: number; dateRange?: string };
  
  let users = data.users || [];
  // Update users when data changes
  $: if (data.users) {
    users = data.users;
  }
  
  let searchQuery = $page.url.searchParams.get('search') || '';
  let dateRange = data.dateRange || $page.url.searchParams.get('dateRange') || 'all';
  let loading = false;
  let updatingRole: Record<string, boolean> = {};
  let managingFriendsFor: string | null = null;
  let friendsList: Array<{ id: string; username: string; friendshipId: string; createdAt: Date }> = [];
  let loadingFriends = false;
  let loadingAvailableUsers = false;
  let addingFriend = false;
  let newFriendId = '';
  let availableUsersForFriends: Array<{ id: string; username: string }> = [];

  // Add user form (collapsed by default)
  let showCreate = false;
  let newUserEmail = '';
  let newUserPassword = '';
  let newUserRole: 'personal' | 'admin' = 'personal';
  let creatingUser = false;

  function toggleCreate() { showCreate = !showCreate; }

  async function createUser() {
    if (!newUserEmail.trim() || !newUserPassword.trim()) {
      alert('Email and password are required');
      return;
    }
    creatingUser = true;
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newUserEmail.trim(), password: newUserPassword.trim(), role: newUserRole })
      });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error || 'Failed to create user');
      } else {
        users = [j.user, ...users];
        newUserEmail = '';
        newUserPassword = '';
        newUserRole = 'personal';
        showCreate = false;
      }
    } catch (e) {
      console.error('createUser error', e);
      alert('Failed to create user.');
    } finally {
      creatingUser = false;
    }
  }

  async function deleteUser(userId: string, username: string) {
    if (!confirm(`Delete user ${username}? This cannot be undone.`)) return;
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error || 'Failed to delete user');
      } else {
        users = users.filter(u => u.id !== userId);
      }
    } catch (e) {
      console.error('deleteUser error', e);
      alert('Failed to delete user.');
    }
  }

  const dateRangeOptions = [
    { value: 'all', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'thisWeek', label: 'This Week' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'thisQuarter', label: 'This Quarter' },
    { value: 'lastQuarter', label: 'Last Quarter' },
    { value: 'thisYear', label: 'This Year' },
    { value: 'lastYear', label: 'Last Year' }
  ];
  
  function getDateRange(dateRangeValue: string): { dateFrom: string; dateTo: string } | null {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let startDate: Date;
    let endDate: Date = new Date(today);
    endDate.setHours(23, 59, 59, 999);
    
    switch (dateRangeValue) {
      case 'all':
        return null;
      case 'today':
        startDate = new Date(today);
        break;
      case 'thisWeek':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - today.getDay());
        break;
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'lastMonth':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'thisQuarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'lastQuarter':
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        const lastQuarterYear = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const lastQuarterMonth = lastQuarter < 0 ? 9 : lastQuarter * 3;
        startDate = new Date(lastQuarterYear, lastQuarterMonth, 1);
        endDate = new Date(lastQuarterYear, lastQuarterMonth + 3, 0, 23, 59, 59, 999);
        break;
      case 'thisYear':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'lastYear':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        break;
      default:
        return null;
    }
    
    startDate.setHours(0, 0, 0, 0);
    
    return { dateFrom: startDate.toISOString().split('T')[0], dateTo: endDate.toISOString().split('T')[0] };
  }
  
  async function handleSearch() {
    const params = new URLSearchParams($page.url.searchParams);
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    else params.delete('search');
    
    const dateRangeData = getDateRange(dateRange);
    if (dateRangeData) {
      params.set('dateFrom', dateRangeData.dateFrom);
      params.set('dateTo', dateRangeData.dateTo);
    } else {
      params.delete('dateFrom');
      params.delete('dateTo');
    }
    params.set('dateRange', dateRange);
    params.set('offset', '0');
    await goto(`/admin/users?${params.toString()}`);
  }
  
  function clearFilters() {
    searchQuery = '';
    dateRange = 'all';
    handleSearch();
  }
  
  function handleDateRangeChange() { handleSearch(); }
  
  async function updateUserRole(userId: string, newRole: 'admin' | 'personal') {
    if (updatingRole[userId]) return;
    const user = users.find(u => u.id === userId);
    const originalRole = user?.role || 'personal';
    if (newRole === 'personal' && originalRole === 'admin') {
      if (!confirm(`Are you sure you want to remove admin privileges from ${user.username}?`)) {
        const select = document.querySelector(`[data-user-id="${userId}"]`) as HTMLSelectElement;
        if (select) select.value = originalRole;
        return;
      }
    }
    updatingRole[userId] = true;
    try {
      const response = await apiFetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: newRole })
      });
      const result = await response.json();
      if (result.ok) {
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex !== -1) { users[userIndex].role = newRole; users = [...users]; }
        await invalidate('/admin/users');
      } else {
        alert(result.error || 'Failed to update user role');
        const select = document.querySelector(`[data-user-id="${userId}"]`) as HTMLSelectElement;
        if (select) select.value = originalRole;
      }
    } catch (error) {
      console.error('Failed to update user role:', error);
      alert('Failed to update user role. Please try again.');
      const select = document.querySelector(`[data-user-id="${userId}"]`) as HTMLSelectElement;
      if (select) select.value = originalRole;
    } finally {
      updatingRole[userId] = false;
    }
  }
  
  function viewUserDetails(userId: string) { goto(`/admin/users/${userId}`); }
  
  async function manageFriends(userId: string) {
    managingFriendsFor = userId;
    friendsList = []; // Clear previous list
    availableUsersForFriends = []; // Clear previous list
    await loadFriends(userId);
    // Load available users after friends are loaded
    await loadAvailableUsers(userId);
  }
  
  async function loadFriends(userId: string) {
    loadingFriends = true;
    try {
      const response = await apiFetch(`/api/admin/users/${userId}/friends`);
      const result = await response.json();
      if (result.ok) {
        friendsList = result.friends || [];
      } else {
        alert('Failed to load friends: ' + (result.error || 'Unknown error'));
        friendsList = [];
      }
    } catch (error: any) {
      console.error('Failed to load friends:', error);
      alert('Failed to load friends. Please try again.');
      friendsList = [];
    } finally {
      loadingFriends = false;
    }
  }
  
  async function loadAvailableUsers(excludeUserId: string) {
    loadingAvailableUsers = true;
    try {
      const response = await apiFetch(`/api/admin/users?limit=1000`);
      const result = await response.json();
      if (result.ok && result.users) {
        // Filter out the current user and users already in friends list
        const friendIds = new Set(friendsList.map(f => f.id));
        const available = result.users
          .filter((u: any) => u.id !== excludeUserId && !friendIds.has(u.id))
          .map((u: any) => ({ id: u.id, username: u.username }));
        availableUsersForFriends = available;
        console.log('[loadAvailableUsers]', {
          totalUsers: result.users.length,
          excludeUserId,
          friendIds: Array.from(friendIds),
          friendsListLength: friendsList.length,
          availableCount: available.length,
          available
        });
      } else {
        availableUsersForFriends = [];
      }
    } catch (error: any) {
      console.error('Failed to load available users:', error);
      availableUsersForFriends = [];
    } finally {
      loadingAvailableUsers = false;
    }
  }
  
  async function addFriend() {
    if (!managingFriendsFor || !newFriendId) return;
    
    addingFriend = true;
    try {
      const response = await apiFetch(`/api/admin/users/${managingFriendsFor}/friends`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId: newFriendId })
      });
      
      const result = await response.json();
      if (result.ok) {
        // Reload friends first, then available users
        await loadFriends(managingFriendsFor);
        // Small delay to ensure friendsList is updated
        await new Promise(resolve => setTimeout(resolve, 100));
        await loadAvailableUsers(managingFriendsFor);
        newFriendId = '';
      } else {
        alert('Failed to add friend: ' + (result.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Failed to add friend:', error);
      alert('Failed to add friend. Please try again.');
    } finally {
      addingFriend = false;
    }
  }
  
  async function removeFriend(friendId: string) {
    if (!managingFriendsFor) return;
    
    if (!confirm('Are you sure you want to remove this friend?')) return;
    
    try {
      const response = await apiFetch(`/api/admin/users/${managingFriendsFor}/friends/${friendId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      if (result.ok) {
        // Reload friends first, then available users
        await loadFriends(managingFriendsFor);
        // Small delay to ensure friendsList is updated
        await new Promise(resolve => setTimeout(resolve, 100));
        await loadAvailableUsers(managingFriendsFor);
      } else {
        alert('Failed to remove friend: ' + (result.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Failed to remove friend:', error);
      alert('Failed to remove friend. Please try again.');
    }
  }
  
  function closeManageFriends() {
    managingFriendsFor = null;
    friendsList = [];
    newFriendId = '';
    availableUsersForFriends = [];
  }
  
  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }
  
  onMount(() => {
    document.title = 'User Management - Admin Panel';
  });

  // ===== Organizations admin tools =====
  let orgsApproved: Array<{ id: string; name: string; status: string; createdAt: string; createdBy?: { id: string; username: string } }> = [];
  let orgsPending: Array<{ id: string; name: string; status: string; createdAt: string; description?: string | null; createdBy?: { id: string; username: string } }> = [];
  let loadingOrgs = false;
  let actingOrgId: string | null = null;

  async function loadOrganizations() {
    loadingOrgs = true;
    try {
      const res = await apiFetch('/api/organizations?all=1');
      const j = await res.json();
      if (j.ok) {
        const list = j.organizations || [];
        orgsApproved = list.filter((o: any) => o.status === 'approved');
        orgsPending = list.filter((o: any) => o.status !== 'approved');
      }
    } finally {
      loadingOrgs = false;
    }
  }

  async function approveOrg(orgId: string, action: 'approve'|'reject') {
    actingOrgId = orgId;
    try {
      const res = await apiFetch(`/api/organizations/${orgId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const j = await res.json();
      if (!j.ok) alert(j.error || 'Failed to update organization');
      await loadOrganizations();
    } finally {
      actingOrgId = null;
    }
  }

  async function setOrgAdmin(targetUserId: string, orgId: string, makeAdmin: boolean) {
    if (!orgId) { alert('Choose an organization'); return; }
    try {
      const res = await apiFetch(`/api/organizations/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId, action: makeAdmin ? 'promote' : 'demote' })
      });
      const j = await res.json();
      if (!j.ok) alert(j.error || 'Failed to update membership');
      else alert(makeAdmin ? 'User promoted to org admin.' : 'User demoted to member.');
    } catch (e) {
      alert('Failed to update membership');
    }
  }

  function promoteOrg(userId: string, e: MouseEvent) {
    const select = (e.currentTarget as HTMLElement).previousElementSibling as HTMLSelectElement | null;
    const orgId = select?.value || '';
    setOrgAdmin(userId, orgId, true);
  }

  function demoteOrg(userId: string, e: MouseEvent) {
    const selectWrapper = (e.currentTarget as HTMLElement).previousElementSibling?.previousElementSibling as HTMLSelectElement | null;
    const orgId = selectWrapper?.value || '';
    setOrgAdmin(userId, orgId, false);
  }
  onMount(() => { loadOrganizations(); });
</script>

<svelte:head>
  <title>User Management - Admin Panel</title>
</svelte:head>

<div class="users-page">
  <div class="page-header">
    <h1>User Management</h1>
    <div class="filters-container">
      <div class="search-box">
        <input type="text" placeholder="Search by email or user ID..." bind:value={searchQuery} on:keydown={(e) => e.key === 'Enter' && handleSearch()} />
        <button class="search-btn" on:click={handleSearch} disabled={loading}>{loading ? '...' : '🔍'}</button>
      </div>
      <div class="date-filters">
        <select bind:value={dateRange} on:change={handleDateRangeChange} class="date-range-select">
          {#each dateRangeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        {#if dateRange !== 'all' || searchQuery}
          <button class="clear-btn" on:click={clearFilters}>Clear</button>
        {/if}
        <button class="primary-btn" on:click={toggleCreate}>{showCreate ? 'Close' : 'Create New User'}</button>
      </div>
    </div>
  </div>

  <!-- Organization Admin Tools -->
  <div class="add-user-card">
    <h2>Organization Admin Tools</h2>
    <div class="add-user-form" style="grid-template-columns: 1fr;">
      <div>
        <strong>Pending Organizations</strong>
        {#if loadingOrgs}
          <div class="muted">Loading…</div>
        {:else if orgsPending.length === 0}
          <div class="muted">No pending organizations.</div>
        {:else}
          <ul style="list-style:none; margin: .5rem 0 0; padding: 0; display: grid; gap: .75rem;">
            {#each orgsPending as o}
              <li style="background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:.875rem 1rem; display:grid; grid-template-columns: 1fr auto; gap: 1rem; align-items:center;">
                <div style="display:flex; flex-direction:column; gap: .4rem;">
                  <div style="display:flex; align-items:center; gap: .5rem;">
                    <strong style="font-size:1rem; color:#111;">{o.name}</strong>
                    {#if o.description}
                      <span style="font-size:.85rem; color:#6b7280;">• {o.description}</span>
                    {/if}
                  </div>
                  <div style="display:flex; gap: 1rem; font-size:.85rem; color:#6b7280;">
                    <span>
                      <strong style="color:#4f46e5;">Requested by:</strong> {o.createdBy?.username || 'Unknown'} ({o.createdBy?.id || 'N/A'})
                    </span>
                    <span>
                      <strong style="color:#4f46e5;">Created:</strong> {formatDate(o.createdAt)}
                    </span>
                  </div>
                </div>
                <div style="display:flex; gap: .5rem; align-items:center;">
                  <button class="view-btn" style="background:#10b981; color:#fff; border-color:#10b981;" on:click={() => approveOrg(o.id, 'approve')} disabled={actingOrgId===o.id}>
                    {actingOrgId===o.id ? 'Processing...' : 'Approve'}
                  </button>
                  <button class="view-btn" style="background:#ef4444; color:#fff; border-color:#ef4444;" on:click={() => approveOrg(o.id, 'reject')} disabled={actingOrgId===o.id}>
                    {actingOrgId===o.id ? 'Processing...' : 'Reject'}
                  </button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>

  {#if showCreate}
    <div class="add-user-card">
      <h2>Create New User</h2>
      <div class="add-user-form">
        <input type="email" placeholder="Email" bind:value={newUserEmail} />
        <input type="password" placeholder="Password" bind:value={newUserPassword} />
        <select bind:value={newUserRole}>
          <option value="personal">Personal</option>
          <option value="admin">Admin</option>
        </select>
        <button class="create-btn" on:click={createUser} disabled={creatingUser}>{creatingUser ? 'Creating...' : 'Add User'}</button>
      </div>
    </div>
  {/if}

  <div class="users-table-container">
    {#if users.length === 0}
      <div class="empty-state"><p>No users found.</p></div>
    {/if}
    {#if users.length > 0}
      <table class="users-table">
        <thead>
          <tr>
            <th>Email/Username</th>
            <th>User ID</th>
            <th>Role</th>
            <th>Games Played</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each users as user (user.id)}
            <tr>
              <td class="email-cell">
                {user.username}
                {#if user.organizationsCreated && user.organizationsCreated.length > 0}
                  <div style="font-size: 0.75rem; color: #6b7280; margin-top: 2px;">
                    Created {user.organizationsCreated.length} org{user.organizationsCreated.length !== 1 ? 's' : ''}
                    {#each user.organizationsCreated as org}
                      <div style="margin-left: 0.5rem; font-size: 0.7rem;">
                        • {org.name}: {org.memberCount || 0} member{org.memberCount !== 1 ? 's' : ''}
                      </div>
                    {/each}
                  </div>
                {/if}
              </td>
              <td class="id-cell">{user.id}</td>
              <td class="role-cell">
                <select
                  value={user.role}
                  data-user-id={user.id}
                  on:change={(e) => {
                    const value = e.currentTarget.value;
                    if ((value === 'admin' || value === 'personal') && value !== user.role) {
                      updateUserRole(user.id, value);
                    }
                  }}
                  disabled={updatingRole[user.id]}
                  class="role-select"
                  class:admin={user.role === 'admin'}
                >
                  <option value="personal">Personal</option>
                  <option value="admin">Admin</option>
                </select>
                {#if updatingRole[user.id]}
                  <span class="updating-indicator">Updating...</span>
                {/if}
              </td>
              <td class="games-cell">{user.stats?.totalSessions || 0}</td>
              <td class="date-cell">{formatDate(user.createdAt)}</td>
              <td class="actions-cell">
                <div class="action-buttons">
                  <button class="view-btn" on:click={() => viewUserDetails(user.id)}>View Details</button>
                  <button class="friends-btn" on:click={() => manageFriends(user.id)} title="Manage Friends">👥 Friends</button>
                  <select class="role-select" style="min-width:180px" title="Choose org to promote/demote">
                    <option value="">Select organization…</option>
                    {#each orgsApproved as o}
                      <option value={o.id}>{o.name}</option>
                    {/each}
                  </select>
                  <button class="view-btn" on:click={(e) => promoteOrg(user.id, e)}>Promote to Org Admin</button>
                  <button class="view-btn" on:click={(e) => demoteOrg(user.id, e)}>Demote</button>
                  <button class="icon-btn delete-icon" aria-label="Delete user" title="Delete user" on:click={() => deleteUser(user.id, user.username)}>🗑️</button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if data.total > data.limit}
        <div class="pagination">
          <button disabled={data.offset === 0} on:click={() => { const params = new URLSearchParams($page.url.searchParams); params.set('offset', String(Math.max(0, data.offset - data.limit))); goto(`/admin/users?${params.toString()}`); }}>← Previous</button>
          <span class="page-info">Showing {data.offset + 1}-{Math.min(data.offset + data.limit, data.total)} of {data.total}</span>
          <button disabled={data.offset + data.limit >= data.total} on:click={() => { const params = new URLSearchParams($page.url.searchParams); params.set('offset', String(data.offset + data.limit)); goto(`/admin/users?${params.toString()}`); }}>Next →</button>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Manage Friends Modal -->
  {#if managingFriendsFor}
    <div class="modal-overlay" on:click={closeManageFriends} role="presentation">
      <div class="modal-content" on:click|stopPropagation role="dialog">
        <div class="modal-header">
          <h2>Manage Friends</h2>
          <button class="close-btn" on:click={closeManageFriends}>×</button>
        </div>
        
        <div class="modal-body">
          <!-- Add Friend Section -->
          <div class="add-friend-section">
            <h3>Add Friend</h3>
            <div class="add-friend-form">
              <select
                bind:value={newFriendId}
                disabled={addingFriend || loadingAvailableUsers}
                class="friend-select"
              >
                <option value="">Select a user...</option>
                {#each availableUsersForFriends as user}
                  <option value={user.id}>{user.username} ({user.id})</option>
                {/each}
              </select>
              <button
                class="add-friend-btn"
                on:click={addFriend}
                disabled={!newFriendId || addingFriend}
              >
                {addingFriend ? 'Adding...' : 'Add Friend'}
              </button>
            </div>
            {#if loadingAvailableUsers}
              <p class="no-users">Loading available users...</p>
            {:else if availableUsersForFriends.length === 0}
              <p class="no-users">All users are already friends with this user.</p>
            {/if}
          </div>
          
          <!-- Friends List Section -->
          <div class="friends-list-section">
            <h3>Current Friends ({friendsList.length})</h3>
            {#if loadingFriends}
              <div class="loading-friends">Loading friends...</div>
            {:else if friendsList.length === 0}
              <div class="no-friends">This user has no friends yet.</div>
            {:else}
              <div class="friends-list">
                {#each friendsList as friend}
                  <div class="friend-item">
                    <div class="friend-info">
                      <span class="friend-username">{friend.username}</span>
                      <span class="friend-id">ID: {friend.id}</span>
                    </div>
                    <button
                      class="remove-friend-btn"
                      on:click={() => removeFriend(friend.id)}
                      title="Remove Friend"
                    >
                      ✕
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .users-page { max-width: 1600px; margin: 0 auto; }
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem; }
  .page-header h1 { font-family: Georgia, serif; font-size: clamp(1.5rem, 4vw, 2.5rem); font-weight: 800; color: white; -webkit-text-stroke: 2px rgba(0,0,0,.45); text-shadow: 0 10px 14px rgba(0,0,0,.35); margin: 0; }
  .filters-container { display: flex; flex-direction: column; gap: 0.75rem; align-items: flex-end; }
  .search-box { display: flex; gap: 0.5rem; }
  .search-box input[type="text"] { padding: 0.5rem 0.75rem; border-radius: 10px; border: 1px solid #e5e7eb; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  .search-box input[type="text"]:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.12); }
  .search-btn { padding: 0.45rem 0.6rem; border-radius: 10px; border: 1px solid #e5e7eb; background: #fff; cursor: pointer; display: grid; place-items: center; }
  .search-btn:hover { background: #f8fafc; }
  .date-filters { display: flex; gap: 0.5rem; align-items: center; }
  .date-range-select { padding: 0.5rem 0.875rem; border-radius: 6px; border: 1px solid rgba(255,255,255,.3); background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.90)); backdrop-filter: blur(22px) saturate(140%); box-shadow: 0 4px 12px rgba(79,70,229,.16); font-size: 0.875rem; color: #111; font-weight: 500; cursor: pointer; transition: all 0.15s; min-width: 160px; }
  .date-range-select:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
  .date-range-select:hover { border-color: #4f46e5; }
  .clear-btn { padding: 0.5rem 0.875rem; border-radius: 6px; border: 1px solid #e5e7eb; background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.90)); backdrop-filter: blur(22px) saturate(140%); box-shadow: 0 4px 12px rgba(79,70,229,.16); color: #6b7280; font-weight: 600; font-size: 0.875rem; cursor: pointer; transition: all 0.15s; }
  .clear-btn:hover { background: rgba(239, 68, 68, 0.1); border-color: #ef4444; color: #ef4444; }
  .primary-btn { padding: 0.5rem 0.875rem; border-radius: 6px; border: 1px solid #e5e7eb; background: linear-gradient(135deg, #4f46e5, #22d3ee); color: #fff; font-weight: 700; cursor: pointer; }

  .add-user-card { margin: 0 0 1rem 0; padding: 1rem; border-radius: 16px; border: 1px solid rgba(255,255,255,.55); background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)), radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%), radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%); box-shadow: 0 24px 68px rgba(0,0,0,.25); backdrop-filter: blur(22px) saturate(140%); }
  .add-user-card h2 { font-size: 0.9rem; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; margin: 0 0 .75rem 0; }
  .add-user-form { display: grid; grid-template-columns: 1fr 1fr 160px 140px; gap: .5rem; }
  .add-user-form input, .add-user-form select { padding: .5rem .75rem; border: 1px solid #e5e7eb; border-radius: 8px; font-size: .9rem; }
  .create-btn { padding: .5rem .75rem; border-radius: 8px; border: 1px solid #e5e7eb; background: linear-gradient(135deg, #4f46e5, #22d3ee); color: #fff; font-weight: 700; cursor: pointer; }
  .create-btn:disabled { opacity: .5; cursor: not-allowed; }

  .users-table-container { background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)), radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%), radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%); border: 1px solid rgba(255,255,255,.55); border-radius: 24px; padding: 0; box-shadow: 0 24px 68px rgba(0,0,0,.25); backdrop-filter: blur(22px) saturate(140%); overflow-x: auto; }
  .users-table { width: 100%; border-collapse: collapse; }
  .users-table th { text-align: left; padding: 0.875rem 1rem; font-weight: 700; font-size: 0.75rem; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid rgba(79, 70, 229, 0.2); background: linear-gradient(135deg, rgba(79, 70, 229, 0.05), rgba(34, 211, 238, 0.05)); }
  .users-table td { padding: 0.75rem 1rem; border-bottom: 1px solid #f3f4f6; font-size: 0.875rem; }
  .users-table tbody tr:hover { background: rgba(79, 70, 229, 0.05); transform: scale(1.01); transition: all 0.15s; }
  .email-cell { font-weight: 600; color: #111; }
  .id-cell { font-family: monospace; color: #6b7280; font-size: 0.9rem; }
  .role-select { padding: 0.375rem 0.625rem; border-radius: 4px; border: 1px solid #e5e7eb; background: white; font-weight: 500; font-size: 0.875rem; cursor: pointer; transition: all 0.15s; }
  .role-select.admin { background: linear-gradient(135deg, #fef3c7, #fde68a); border-color: #f59e0b; color: #92400e; font-weight: 700; }
  .role-select:disabled { opacity: 0.5; cursor: not-allowed; }
  .updating-indicator { font-size: 0.75rem; color: #9ca3af; font-style: italic; margin-left: 0.5rem; }
  .games-cell, .date-cell { color: #6b7280; font-size: 0.875rem; }
  .action-buttons { display: flex; gap: 0.5rem; align-items: center; }
  .friends-btn { padding: 0.375rem 0.75rem; border-radius: 4px; border: 1px solid #e5e7eb; background: linear-gradient(135deg, #fef3c7, #fde68a); color: #92400e; font-weight: 600; font-size: 0.875rem; cursor: pointer; transition: all 0.15s; }
  .friends-btn:hover { background: linear-gradient(135deg, #fde68a, #fcd34d); border-color: #f59e0b; transform: translateY(-1px); }
  .view-btn { padding: 0.375rem 0.75rem; border-radius: 4px; border: 1px solid #e5e7eb; background: white; color: #4f46e5; font-weight: 600; font-size: 0.875rem; cursor: pointer; transition: all 0.15s; }
  .view-btn:hover { background: #4f46e5; color: white; border-color: #4f46e5; }
  .icon-btn { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 6px; border: 1px solid #e5e7eb; background: white; cursor: pointer; }
  .icon-btn.delete-icon { border-color: #ef4444; background: linear-gradient(135deg, #fecaca, #ef4444); color: #fff; font-weight: 900; }
  .icon-btn.delete-icon:hover { filter: brightness(1.05); }

  .empty-state { text-align: center; padding: 2rem; color: #9ca3af; font-size: 0.875rem; }
  .pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
  .pagination button { padding: 0.5rem 0.875rem; border-radius: 4px; border: 1px solid #e5e7eb; background: white; color: #4f46e5; font-weight: 600; font-size: 0.875rem; cursor: pointer; transition: all 0.15s; }
  .pagination button:hover:not(:disabled) { background: #4f46e5; color: white; border-color: #4f46e5; }
  .pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
  .page-info { color: #6b7280; font-weight: 500; font-size: 0.875rem; }

  /* ===== Manage Friends Modal ===== */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.28);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: 24px;
    backdrop-filter: blur(2px);
  }
  .modal-content {
    background: linear-gradient(180deg, rgba(255,255,255,.90), rgba(255,255,255,.88)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.08), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.08), transparent 60%);
    border: 1px solid rgba(255,255,255,.72);
    border-radius: 20px;
    box-shadow: 0 24px 70px rgba(0,0,0,.26);
    backdrop-filter: blur(16px) saturate(140%);
    width: min(680px, 96vw);
    max-height: 85vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1.1rem;
    border-bottom: 1px solid rgba(0,0,0,.06);
  }
  .modal-header h2 { margin: 0; font-size: 1.1rem; font-weight: 800; color: #0f172a; letter-spacing: .2px; }
  .close-btn {
    width: 30px; height: 30px; border-radius: 50%; border: 0; background: #eef2ff; color: #64748b;
    cursor: pointer; font-size: 1.15rem; display: grid; place-items: center;
  }
  .close-btn:hover { background: #e0e7ff; color: #334155; }
  .modal-body { padding: 1rem 1.1rem; overflow-y: auto; }

  .add-friend-section { margin-bottom: 1rem; padding-bottom: .9rem; border-bottom: 1px solid rgba(0,0,0,.06); }
  .add-friend-section h3, .friends-list-section h3 { margin: 0 0 .65rem 0; font-size: .9rem; font-weight: 700; color: #0f172a; }
  .add-friend-form { display: grid; grid-template-columns: 1fr auto; gap: .5rem; align-items: center; }
  .friend-select { padding: .5rem .75rem; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; }
  .add-friend-btn { justify-self: end; padding: .5rem .85rem; border-radius: 8px; border: 1px solid #e5e7eb; background: linear-gradient(135deg, #4f46e5, #22d3ee); color: #fff; font-weight: 700; cursor: pointer; }
  .no-users, .no-friends, .loading-friends { color: #64748b; font-size: .85rem; }
  .friends-list { display: flex; flex-direction: column; gap: .5rem; }
  .friend-item { display: flex; justify-content: space-between; align-items: center; padding: .65rem .75rem; border: 1px solid rgba(0,0,0,.06); border-radius: 10px; background: #fff; }
  .remove-friend-btn { width: 26px; height: 26px; border-radius: 50%; border: 0; background: rgba(239,68,68,.12); color: #ef4444; cursor: pointer; font-weight: 900; }
  .remove-friend-btn:hover { filter: brightness(1.05); }
</style>




