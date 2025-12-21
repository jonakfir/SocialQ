<script lang="ts">
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api';

  let loading = true;
  let error: string | null = null;
  let organizations: Array<{
    id: string;
    name: string;
    description?: string | null;
    status: string;
    createdAt: string;
    createdBy: { id: string; username: string };
    memberCount: number;
    pendingCount: number;
    orgAdmins: Array<{ id: string; username: string }>;
    totalMemberships: number;
  }> = [];
  
  let searchQuery = '';
  let managingMembersFor: string | null = null;
  let membersList: Array<{ id: string; username: string; role: string; status: string; joinedAt: string }> = [];
  let loadingMembers = false;
  let addingMember = false;
  let removingMember: Record<string, boolean> = {};
  let newMemberId = '';
  let availableUsers: Array<{ id: string; username: string }> = [];
  let loadingAvailableUsers = false;
  let searchUserQuery = '';
  
  // Create organization state
  let showCreateOrgModal = false;
  let creatingOrg = false;
  let newOrgName = '';
  let newOrgDescription = '';
  let newOrgCreatorId = '';
  let availableUsersForCreator: Array<{ id: string; username: string }> = [];
  let loadingUsersForCreator = false;
  let orgError = '';

  async function loadOrganizations() {
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      const res = await apiFetch(`/api/admin/organizations?${params.toString()}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load organizations');
      organizations = data.organizations || [];
    } catch (e: any) {
      error = e?.message || 'Failed to load organizations';
      console.error('loadOrganizations error', e);
    } finally {
      loading = false;
    }
  }

  async function handleSearch() {
    await loadOrganizations();
  }

  function formatDate(dateStr: string | Date) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function manageMembers(orgId: string) {
    managingMembersFor = orgId;
    searchUserQuery = ''; // Reset search
    await Promise.all([
      loadMembers(orgId),
      loadAvailableUsers(orgId)
    ]);
  }

  async function loadMembers(orgId: string) {
    loadingMembers = true;
    try {
      const res = await apiFetch(`/api/organizations/${orgId}/members`);
      const data = await res.json();
      if (data.ok) {
        membersList = (data.members || []).map((m: any) => ({
          id: m.user.id,
          username: m.user.username,
          role: m.role,
          status: m.status,
          joinedAt: m.joinedAt
        }));
      }
    } catch (e) {
      console.error('loadMembers error', e);
    } finally {
      loadingMembers = false;
    }
  }

  async function loadAvailableUsers(orgId: string) {
    loadingAvailableUsers = true;
    try {
      // Fetch all users
      const res = await apiFetch('/api/admin/users?limit=1000');
      const data = await res.json();
      if (data.ok) {
        const allUsers = data.users || [];
        
        // Get current member IDs from membersList if already loaded, otherwise fetch
        let currentMemberIds = new Set<string>();
        if (membersList.length > 0) {
          currentMemberIds = new Set(membersList.map(m => m.id));
        } else {
          const membersRes = await apiFetch(`/api/organizations/${orgId}/members`);
          const membersData = await membersRes.json();
          if (membersData.ok) {
            currentMemberIds = new Set((membersData.members || []).map((m: any) => m.user.id));
          }
        }
        
        // Filter out current members
        let filtered = allUsers
          .filter((u: any) => !currentMemberIds.has(u.id))
          .map((u: any) => ({ id: u.id, username: u.username }));
        
        // Apply search filter if provided
        if (searchUserQuery) {
          const queryLower = searchUserQuery.toLowerCase();
          filtered = filtered.filter(u => 
            u.username.toLowerCase().includes(queryLower) || 
            u.id.toLowerCase().includes(queryLower)
          );
        }
        
        availableUsers = filtered;
      }
    } catch (e) {
      console.error('loadAvailableUsers error', e);
      availableUsers = [];
    } finally {
      loadingAvailableUsers = false;
    }
  }

  async function addMember() {
    if (!managingMembersFor || !newMemberId) {
      alert('Please select a user to add');
      return;
    }
    addingMember = true;
    try {
      const res = await apiFetch(`/api/admin/organizations/${managingMembersFor}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', userId: newMemberId })
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Failed to add member');
      } else {
        newMemberId = '';
        await loadMembers(managingMembersFor);
        await loadAvailableUsers(managingMembersFor);
        await loadOrganizations(); // Refresh org list to update member counts
      }
    } catch (e: any) {
      console.error('addMember error', e);
      alert('Failed to add member: ' + (e?.message || 'Unknown error'));
    } finally {
      addingMember = false;
    }
  }

  async function removeMember(userId: string) {
    if (!managingMembersFor) return;
    if (!confirm('Remove this member from the organization?')) return;
    removingMember[userId] = true;
    try {
      const res = await apiFetch(`/api/admin/organizations/${managingMembersFor}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', userId })
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Failed to remove member');
      } else {
        await loadMembers(managingMembersFor);
        await loadAvailableUsers(managingMembersFor);
        await loadOrganizations(); // Refresh org list to update member counts
      }
    } catch (e: any) {
      console.error('removeMember error', e);
      alert('Failed to remove member: ' + (e?.message || 'Unknown error'));
    } finally {
      removingMember[userId] = false;
    }
  }

  function closeManageMembers() {
    managingMembersFor = null;
    membersList = [];
    availableUsers = [];
    newMemberId = '';
    searchUserQuery = '';
  }

  // Debounce search for available users
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  
  function handleSearchUserInput() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (managingMembersFor) {
        loadAvailableUsers(managingMembersFor);
      }
    }, 300);
  }

  async function loadUsersForCreator() {
    loadingUsersForCreator = true;
    try {
      const res = await apiFetch('/api/admin/users?limit=1000');
      const data = await res.json();
      if (data.ok) {
        availableUsersForCreator = (data.users || []).map((u: any) => ({
          id: u.id,
          username: u.username
        }));
      }
    } catch (e) {
      console.error('Failed to load users:', e);
      availableUsersForCreator = [];
    } finally {
      loadingUsersForCreator = false;
    }
  }

  async function createOrganization() {
    if (!newOrgName.trim()) {
      orgError = 'Organization name is required';
      return;
    }

    creatingOrg = true;
    orgError = '';
    try {
      // Get user email from localStorage to help with auth
      const userEmail = localStorage.getItem('email') || localStorage.getItem('username') || '';
      const userId = localStorage.getItem('userId') || '';
      
      console.log('[createOrganization] User info from localStorage:', { email: userEmail, userId });
      
      // Build headers with auth info
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (userEmail) {
        headers['X-User-Email'] = userEmail;
      }
      if (userId) {
        headers['X-User-Id'] = userId;
      }
      
      const res = await apiFetch('/api/admin/organizations', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newOrgName.trim(),
          description: newOrgDescription.trim() || null,
          createdByUserId: newOrgCreatorId || undefined
        })
      });
      
      console.log('[createOrganization] Response status:', res.status, 'ok:', res.ok);
      const data = await res.json();
      console.log('[createOrganization] Response data:', data);
      
      if (data.ok) {
        // Success - close modal and refresh
        showCreateOrgModal = false;
        newOrgName = '';
        newOrgDescription = '';
        newOrgCreatorId = '';
        await loadOrganizations();
        alert('Organization created successfully!');
      } else {
        orgError = data.error || 'Failed to create organization';
        console.error('[createOrganization] Error from server:', data.error);
      }
    } catch (e: any) {
      orgError = e?.message || 'Failed to create organization';
      console.error('[createOrganization] Exception:', e);
    } finally {
      creatingOrg = false;
    }
  }

  function openCreateOrgModal() {
    showCreateOrgModal = true;
    orgError = '';
    newOrgName = '';
    newOrgDescription = '';
    newOrgCreatorId = '';
    loadUsersForCreator();
  }

  function closeCreateOrgModal() {
    showCreateOrgModal = false;
    orgError = '';
    newOrgName = '';
    newOrgDescription = '';
    newOrgCreatorId = '';
  }

  onMount(() => {
    loadOrganizations();
  });
</script>

<svelte:head>
  <title>Organizations Management - Admin Panel</title>
</svelte:head>

<div class="orgs-page">
  <div class="page-header">
    <h1>Organizations Management</h1>
    <div class="filters-container">
      <button class="create-org-btn" on:click={openCreateOrgModal} title="Create a new organization">
        ➕ Create Organization
      </button>
      <div class="search-box">
        <input 
          type="text" 
          placeholder="Search by organization name or creator..." 
          bind:value={searchQuery} 
          on:keydown={(e) => e.key === 'Enter' && handleSearch()} 
        />
        <button class="search-btn" on:click={handleSearch} disabled={loading}>
          {loading ? '...' : '🔍'}
        </button>
      </div>
    </div>
  </div>

  <div class="orgs-table-container">
    {#if loading}
      <div class="empty-state"><p>Loading organizations...</p></div>
    {:else if error}
      <div class="empty-state error"><p>{error}</p></div>
    {:else if organizations.length === 0}
      <div class="empty-state"><p>No organizations found.</p></div>
    {:else}
      <table class="orgs-table">
        <thead>
          <tr>
            <th>Organization Name</th>
            <th>Status</th>
            <th>Created By</th>
            <th>Members</th>
            <th>Org Admins</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each organizations as org (org.id)}
            <tr>
              <td class="name-cell">
                <div style="font-weight: 600; color: #111;">{org.name}</div>
                {#if org.description}
                  <div style="font-size: 0.75rem; color: #6b7280; margin-top: 2px;">
                    {org.description}
                  </div>
                {/if}
              </td>
              <td class="status-cell">
                <span class="status-badge" class:pending={org.status === 'pending'} class:approved={org.status === 'approved'} class:rejected={org.status === 'rejected'}>
                  {org.status}
                </span>
                {#if org.pendingCount > 0}
                  <div style="font-size: 0.7rem; color: #f59e0b; margin-top: 2px;">
                    {org.pendingCount} pending
                  </div>
                {/if}
              </td>
              <td class="creator-cell">
                <div style="font-weight: 500; color: #111;">{org.createdBy.username}</div>
                <div style="font-size: 0.75rem; color: #6b7280; font-family: monospace;">
                  {org.createdBy.id}
                </div>
              </td>
              <td class="members-cell">
                <div style="font-weight: 600; color: #4f46e5; font-size: 1.1rem;">
                  {org.memberCount}
                </div>
                <div style="font-size: 0.7rem; color: #6b7280;">
                  {org.totalMemberships} total
                </div>
              </td>
              <td class="admins-cell">
                {#if org.orgAdmins.length === 0}
                  <span style="color: #9ca3af; font-size: 0.875rem;">None</span>
                {:else}
                  {#each org.orgAdmins as admin}
                    <div style="font-size: 0.875rem; color: #111; margin-bottom: 2px;">
                      {admin.username}
                    </div>
                  {/each}
                {/if}
              </td>
              <td class="date-cell">{formatDate(org.createdAt)}</td>
              <td class="actions-cell">
                <button class="view-btn" on:click={() => manageMembers(org.id)}>
                  Manage Members
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- Manage Members Modal -->
  {#if managingMembersFor}
    <div 
      class="modal-overlay" 
      on:click={closeManageMembers} 
      on:keydown={(e) => e.key === 'Escape' && closeManageMembers()}
      role="presentation"
      tabindex="-1"
    >
      <div 
        class="modal-content" 
        on:click|stopPropagation 
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div class="modal-header">
          <h2 id="modal-title">Manage Organization Members</h2>
          <button class="close-btn" on:click={closeManageMembers} aria-label="Close modal">×</button>
        </div>
        
        <div class="modal-body">
          <!-- Add Member Section -->
          <div class="add-member-section">
            <h3>Add Member</h3>
            <div class="search-user-box">
              <input 
                type="text" 
                placeholder="Search users by email or ID..." 
                bind:value={searchUserQuery}
                on:input={handleSearchUserInput}
                style="padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid #e5e7eb; width: 100%;"
              />
            </div>
            <div class="add-member-form">
              <select 
                bind:value={newMemberId} 
                class="member-select"
                disabled={loadingAvailableUsers || addingMember}
              >
                <option value="">Select user to add...</option>
                {#if loadingAvailableUsers}
                  <option disabled>Loading users...</option>
                {:else if availableUsers.length === 0}
                  <option disabled>No available users</option>
                {:else}
                  {#each availableUsers as user}
                    <option value={user.id}>{user.username} ({user.id})</option>
                  {/each}
                {/if}
              </select>
              <button 
                class="add-member-btn" 
                on:click={addMember} 
                disabled={!newMemberId || addingMember || loadingAvailableUsers}
              >
                {addingMember ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>

          <!-- Current Members Section -->
          <div class="members-list-section">
            <h3>Current Members</h3>
            {#if loadingMembers}
              <div class="loading-members">Loading members...</div>
            {:else if membersList.length === 0}
              <div class="no-members">No members yet.</div>
            {:else}
              <div class="members-list">
                {#each membersList as member}
                  <div class="member-item">
                    <div class="member-info">
                      <div style="font-weight: 600; color: #111;">{member.username}</div>
                      <div style="font-size: 0.75rem; color: #6b7280; font-family: monospace;">
                        {member.id}
                      </div>
                      <div style="display: flex; gap: 0.5rem; margin-top: 4px;">
                        <span class="role-badge" class:admin={member.role === 'org_admin'}>
                          {member.role === 'org_admin' ? 'Org Admin' : 'Member'}
                        </span>
                        <span class="status-badge-small" class:approved={member.status === 'approved'} class:pending={member.status === 'pending'}>
                          {member.status}
                        </span>
                      </div>
                      <div style="font-size: 0.7rem; color: #9ca3af; margin-top: 2px;">
                        Joined: {formatDate(member.joinedAt)}
                      </div>
                    </div>
                    <button 
                      class="remove-member-btn" 
                      on:click={() => removeMember(member.id)}
                      disabled={removingMember[member.id]}
                      title="Remove member"
                    >
                      {removingMember[member.id] ? '...' : '×'}
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

  <!-- Create Organization Modal -->
  {#if showCreateOrgModal}
    <div 
      class="modal-overlay" 
      on:click={closeCreateOrgModal} 
      on:keydown={(e) => e.key === 'Escape' && closeCreateOrgModal()}
      role="presentation"
      tabindex="-1"
    >
      <div 
        class="modal-content" 
        on:click|stopPropagation 
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div class="modal-header">
          <h2 id="modal-title">Create New Organization</h2>
          <button class="close-btn" on:click={closeCreateOrgModal} aria-label="Close modal">×</button>
        </div>
        
        <div class="modal-body">
          {#if orgError}
            <div class="error-message">{orgError}</div>
          {/if}
          
          <div class="form-group">
            <label for="org-name">Organization Name *</label>
            <input
              id="org-name"
              type="text"
              bind:value={newOrgName}
              placeholder="Enter organization name..."
              disabled={creatingOrg}
              on:keydown={(e) => e.key === 'Enter' && !creatingOrg && createOrganization()}
            />
          </div>
          
          <div class="form-group">
            <label for="org-description">Description (Optional)</label>
            <textarea
              id="org-description"
              bind:value={newOrgDescription}
              placeholder="Enter organization description..."
              disabled={creatingOrg}
              rows="3"
            ></textarea>
          </div>
          
          <div class="form-group">
            <label for="org-creator">Organization Creator (Optional)</label>
            <select
              id="org-creator"
              bind:value={newOrgCreatorId}
              disabled={creatingOrg || loadingUsersForCreator}
            >
              <option value="">Use current admin (you)</option>
              {#if loadingUsersForCreator}
                <option disabled>Loading users...</option>
              {:else if availableUsersForCreator.length === 0}
                <option disabled>No users available</option>
              {:else}
                {#each availableUsersForCreator as user}
                  <option value={user.id}>{user.username} ({user.id})</option>
                {/each}
              {/if}
            </select>
            <div class="form-hint">Leave empty to create as yourself, or select another user to create it on their behalf</div>
          </div>
          
          <div class="modal-actions">
            <button class="modal-btn cancel-btn" on:click={closeCreateOrgModal} disabled={creatingOrg}>
              Cancel
            </button>
            <button class="modal-btn create-btn" on:click={createOrganization} disabled={creatingOrg || !newOrgName.trim()}>
              {creatingOrg ? 'Creating...' : 'Create Organization'}
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .orgs-page { 
    max-width: 1600px; 
    margin: 0 auto; 
  }
  
  .page-header { 
    display: flex; 
    justify-content: space-between; 
    align-items: flex-start; 
    margin-bottom: 1rem; 
    flex-wrap: wrap; 
    gap: 1rem; 
  }
  
  .page-header h1 { 
    font-family: Georgia, serif; 
    font-size: clamp(1.5rem, 4vw, 2.5rem); 
    font-weight: 800; 
    color: white; 
    -webkit-text-stroke: 2px rgba(0,0,0,.45); 
    text-shadow: 0 10px 14px rgba(0,0,0,.35); 
    margin: 0; 
  }
  
  .filters-container { 
    display: flex; 
    flex-direction: row; 
    gap: 0.75rem; 
    align-items: center; 
    flex-wrap: wrap;
  }
  
  .create-org-btn {
    padding: 0.625rem 1.25rem;
    border-radius: 10px;
    border: 1px solid rgba(16, 185, 129, .4);
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(16, 185, 129, .3);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
  }
  
  .create-org-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(16, 185, 129, .4);
    filter: brightness(1.05);
    border-color: rgba(16, 185, 129, .6);
  }
  
  .search-box { 
    display: flex; 
    gap: 0.5rem; 
  }
  
  .search-box input[type="text"] { 
    padding: 0.5rem 0.75rem; 
    border-radius: 10px; 
    border: 1px solid #e5e7eb; 
    background: #fff; 
    box-shadow: 0 1px 2px rgba(0,0,0,.05); 
    min-width: 300px;
  }
  
  .search-box input[type="text"]:focus { 
    outline: none; 
    border-color: #4f46e5; 
    box-shadow: 0 0 0 3px rgba(79,70,229,0.12); 
  }
  
  .search-btn { 
    padding: 0.45rem 0.6rem; 
    border-radius: 10px; 
    border: 1px solid #e5e7eb; 
    background: #fff; 
    cursor: pointer; 
    display: grid; 
    place-items: center; 
  }
  
  .search-btn:hover { 
    background: #f8fafc; 
  }
  
  .search-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .orgs-table-container { 
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)), 
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%), 
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%); 
    border: 1px solid rgba(255,255,255,.55); 
    border-radius: 24px; 
    padding: 0; 
    box-shadow: 0 24px 68px rgba(0,0,0,.25); 
    backdrop-filter: blur(22px) saturate(140%); 
    overflow-x: auto; 
  }
  
  .orgs-table { 
    width: 100%; 
    border-collapse: collapse; 
  }
  
  .orgs-table th { 
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
  
  .orgs-table td { 
    padding: 0.75rem 1rem; 
    border-bottom: 1px solid #f3f4f6; 
    font-size: 0.875rem; 
  }
  
  .orgs-table tbody tr:hover { 
    background: rgba(79, 70, 229, 0.05); 
    transform: scale(1.01); 
    transition: all 0.15s; 
  }
  
  .name-cell { 
    font-weight: 600; 
    color: #111; 
    min-width: 200px;
  }
  
  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: capitalize;
  }
  
  .status-badge.pending {
    background: #fef3c7;
    color: #92400e;
  }
  
  .status-badge.approved {
    background: #d1fae5;
    color: #065f46;
  }
  
  .status-badge.rejected {
    background: #fee2e2;
    color: #991b1b;
  }
  
  .status-badge-small {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: capitalize;
  }
  
  .status-badge-small.approved {
    background: #d1fae5;
    color: #065f46;
  }
  
  .status-badge-small.pending {
    background: #fef3c7;
    color: #92400e;
  }
  
  .creator-cell { 
    color: #111; 
    min-width: 180px;
  }
  
  .members-cell { 
    text-align: center;
    min-width: 100px;
  }
  
  .admins-cell { 
    color: #111; 
    min-width: 150px;
  }
  
  .date-cell { 
    color: #6b7280; 
    font-size: 0.875rem; 
    white-space: nowrap;
  }
  
  .actions-cell { 
    white-space: nowrap;
  }
  
  .view-btn { 
    padding: 0.375rem 0.75rem; 
    border-radius: 4px; 
    border: 1px solid #e5e7eb; 
    background: white; 
    color: #4f46e5; 
    font-weight: 600; 
    font-size: 0.875rem; 
    cursor: pointer; 
    transition: all 0.15s; 
  }
  
  .view-btn:hover { 
    background: #4f46e5; 
    color: white; 
    border-color: #4f46e5; 
  }
  
  .view-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .empty-state { 
    text-align: center; 
    padding: 2rem; 
    color: #9ca3af; 
    font-size: 0.875rem; 
  }
  
  .empty-state.error {
    color: #ef4444;
  }

  /* ===== Manage Members Modal ===== */
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
  
  .modal-header h2 { 
    margin: 0; 
    font-size: 1.1rem; 
    font-weight: 800; 
    color: #0f172a; 
    letter-spacing: .2px; 
  }
  
  .close-btn {
    width: 30px; 
    height: 30px; 
    border-radius: 50%; 
    border: 0; 
    background: #eef2ff; 
    color: #64748b;
    cursor: pointer; 
    font-size: 1.15rem; 
    display: grid; 
    place-items: center;
  }
  
  .close-btn:hover { 
    background: #e0e7ff; 
    color: #334155; 
  }
  
  .modal-body { 
    padding: 1rem 1.1rem; 
    overflow-y: auto; 
  }

  .add-member-section { 
    margin-bottom: 1rem; 
    padding-bottom: .9rem; 
    border-bottom: 1px solid rgba(0,0,0,.06); 
  }
  
  .add-member-section h3, .members-list-section h3 { 
    margin: 0 0 .65rem 0; 
    font-size: .9rem; 
    font-weight: 700; 
    color: #0f172a; 
  }
  
  .search-user-box {
    margin-bottom: 0.5rem;
  }
  
  .add-member-form { 
    display: grid; 
    grid-template-columns: 1fr auto; 
    gap: .5rem; 
    align-items: center; 
  }
  
  .member-select { 
    padding: .5rem .75rem; 
    border: 1px solid #e5e7eb; 
    border-radius: 8px; 
    background: #fff; 
    font-size: 0.875rem;
  }
  
  .member-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .add-member-btn { 
    justify-self: end; 
    padding: .5rem .85rem; 
    border-radius: 8px; 
    border: 1px solid #e5e7eb; 
    background: linear-gradient(135deg, #4f46e5, #22d3ee); 
    color: #fff; 
    font-weight: 700; 
    cursor: pointer; 
    white-space: nowrap;
  }
  
  .add-member-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79,70,229,0.2);
  }
  
  .add-member-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .no-members, .loading-members { 
    color: #64748b; 
    font-size: .85rem; 
  }
  
  .members-list { 
    display: flex; 
    flex-direction: column; 
    gap: .5rem; 
  }
  
  .member-item { 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    padding: .65rem .75rem; 
    border: 1px solid rgba(0,0,0,.06); 
    border-radius: 10px; 
    background: #fff; 
  }
  
  .member-info {
    flex: 1;
  }
  
  .role-badge {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    background: #e5e7eb;
    color: #374151;
  }
  
  .role-badge.admin {
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    color: #92400e;
  }
  
  .remove-member-btn { 
    width: 26px; 
    height: 26px; 
    border-radius: 50%; 
    border: 0; 
    background: rgba(239,68,68,.12); 
    color: #ef4444; 
    cursor: pointer; 
    font-weight: 900; 
    font-size: 1.2rem;
    display: grid;
    place-items: center;
  }
  
  .remove-member-btn:hover:not(:disabled) { 
    background: rgba(239,68,68,.2);
    transform: scale(1.1);
  }
  
  .remove-member-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ===== Create Organization Modal Styles ===== */
  .form-group {
    margin-bottom: 1.25rem;
  }

  .form-group label {
    display: block;
    font-weight: 600;
    font-size: 0.875rem;
    color: #374151;
    margin-bottom: 0.5rem;
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 0.75rem 1rem;
    border-radius: 10px;
    border: 2px solid rgba(79, 70, 229, 0.2);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(16px);
    color: #111;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s;
    box-sizing: border-box;
    font-family: inherit;
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
    background: rgba(255, 255, 255, 1);
  }

  .form-group input:disabled,
  .form-group textarea:disabled,
  .form-group select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
  }

  .form-hint {
    font-size: 0.75rem;
    color: #6b7280;
    margin-top: 0.25rem;
  }

  .error-message {
    padding: 0.75rem 1rem;
    border-radius: 8px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #991b1b;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  .modal-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid rgba(0,0,0,.06);
  }

  .modal-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 12px;
    border: 2px solid rgba(79, 70, 229, 0.3);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(16px);
    color: #111;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .modal-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
  }

  .modal-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-btn {
    background: rgba(255, 255, 255, 0.8);
    color: #6b7280;
  }

  .cancel-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.95);
    color: #111;
  }

  .create-btn {
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    color: white;
    border-color: #4f46e5;
  }

  .create-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #5b52f5, #34e3fe);
    box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
  }
</style>
