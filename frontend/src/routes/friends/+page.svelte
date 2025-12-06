<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import { onMount } from 'svelte';

  export let data: {
    user: { id: number; email?: string } | null;
    friends: any[];
    requests: { sent: any[]; received: any[] };
  };

  let friends = data?.friends || [];
  let requests = data?.requests || { sent: [], received: [] };
  let invitationCode = '';
  let loadingCode = false;
  let activeTab: 'friends' | 'requests' | 'add' | 'orgs' = 'add';
  // Orgs tab state
  let orgSearch = '';
  let orgResults: any[] = [];
  let joiningOrgId: string | null = null;
  let orgName = '';
  let orgDesc = '';
  let creatingOrg = false;
  let createOrgError = '';
  async function searchOrgs() {
    const q = (orgSearch || '').trim();
    const res = await apiFetch(`/api/organizations?search=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (data.ok) orgResults = data.organizations || [];
    else orgResults = [];
  }
  async function requestJoin(orgId: string) {
    joiningOrgId = orgId;
    try {
      const res = await apiFetch(`/api/organizations/${orgId}/join`, { method: 'POST' });
      const data = await res.json();
      if (!data.ok) alert(data.error || 'Failed to request join');
      else await searchOrgs();
    } finally {
      joiningOrgId = null;
    }
  }
  async function createOrganization() {
    createOrgError = '';
    const name = (orgName || '').trim();
    if (!name) { createOrgError = 'Organization name required'; return; }
    creatingOrg = true;
    try {
      const res = await apiFetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: (orgDesc || '').trim() || undefined })
      });
      const j = await res.json();
      if (!j.ok) {
        createOrgError = j.error || 'Failed to create organization';
      } else {
        orgName = '';
        orgDesc = '';
        await searchOrgs();
        alert('Organization created and pending approval.');
      }
    } catch (e: any) {
      createOrgError = e?.message || 'Failed to create organization';
    } finally {
      creatingOrg = false;
    }
  }

  // Add Friends tab state
  let searchEmail = '';
  let searchUserId = '';
  let searchResults: any[] = [];
  let searching = false;
  let friendInvitationCode = '';
  let sendingRequest = false;
  let requestError = '';
  let sentRequestIds = new Set<string>(); // Track which users have had requests sent

  // Initial from email
  function initialFromEmail(email: string): string {
    if (!email) return '?';
    const local = email.includes('@') ? email.split('@')[0] : email;
    const ch = local.trim().charAt(0);
    return ch ? ch.toUpperCase() : '?';
  }

  async function loadInvitationCode() {
    loadingCode = true;
    try {
      const res = await apiFetch('/api/friends/invitation-code');
      const data = await res.json();
      if (data.ok) {
        invitationCode = data.invitationCode;
      }
    } catch (error) {
      console.error('Error loading invitation code:', error);
    } finally {
      loadingCode = false;
    }
  }

  async function copyInvitationCode() {
    if (!invitationCode) return;
    try {
      await navigator.clipboard.writeText(invitationCode);
      alert('Invitation code copied to clipboard!');
    } catch {
      alert('Failed to copy. Code: ' + invitationCode);
    }
  }

  async function searchUsers() {
    // Must have either email (min 2 chars) or user ID (9 digits)
    if ((!searchEmail || searchEmail.length < 2) && (!searchUserId || searchUserId.length !== 9 || !/^\d+$/.test(searchUserId))) {
      searchResults = [];
      return;
    }

    searching = true;
    try {
      console.log('[friends] Searching for email:', searchEmail, 'or userId:', searchUserId);
      let url = '/api/friends/search?';
      if (searchEmail && searchEmail.length >= 2) {
        url += `email=${encodeURIComponent(searchEmail)}`;
      }
      if (searchUserId && searchUserId.length === 9 && /^\d+$/.test(searchUserId)) {
        if (searchEmail && searchEmail.length >= 2) url += '&';
        url += `userId=${encodeURIComponent(searchUserId)}`;
      }
      
      const res = await apiFetch(url);
      const data = await res.json();
      console.log('[friends] Search response:', data);
      if (data.ok) {
        searchResults = data.users || [];
        console.log('[friends] Found', searchResults.length, 'users:', searchResults);
      } else {
        console.error('[friends] Search failed:', data.error);
        searchResults = [];
      }
    } catch (error) {
      console.error('[friends] Error searching users:', error);
      searchResults = [];
    } finally {
      searching = false;
    }
  }

  async function sendFriendRequest(toUserId: string) {
    console.log('[sendFriendRequest] Called with userId:', toUserId);
    if (sendingRequest || sentRequestIds.has(toUserId)) {
      console.log('[sendFriendRequest] Already sending or already sent, returning');
      return;
    }
    
    sendingRequest = true;
    requestError = '';
    
    try {
      console.log('[sendFriendRequest] Sending request to API...');
      const res = await apiFetch('/api/friends/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toUserId })
      });
      
      console.log('[sendFriendRequest] Response status:', res.status);
      const data = await res.json();
      console.log('[sendFriendRequest] Response data:', data);
      
      if (data.ok) {
        // Mark as sent (show checkmark)
        sentRequestIds.add(toUserId);
        console.log('[sendFriendRequest] Request sent successfully, userId:', toUserId);
        
        if (data.accepted) {
          // If accepted automatically, refresh to show them in friends list
          await refreshData();
          // Remove from search results since they're now a friend
          searchResults = searchResults.filter(u => u.id !== toUserId);
        } else {
          // Request sent - keep in search results but show as sent
          // Force reactivity update
          searchResults = [...searchResults];
        }
      } else {
        requestError = data.error || 'Failed to send request';
        console.error('[sendFriendRequest] Failed to send request:', requestError);
      }
    } catch (error) {
      requestError = 'Failed to send request';
      console.error('[sendFriendRequest] Error sending request:', error);
    } finally {
      sendingRequest = false;
      console.log('[sendFriendRequest] Function completed, sendingRequest:', sendingRequest);
    }
  }

  async function sendInvitationCodeRequest() {
    if (!friendInvitationCode || friendInvitationCode.trim().length === 0) {
      alert('Please enter an invitation code');
      return;
    }

    sendingRequest = true;
    requestError = '';
    try {
      const res = await apiFetch('/api/friends/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invitationCode: friendInvitationCode.trim().toUpperCase() })
      });
      const data = await res.json();
      if (data.ok) {
        if (data.accepted) {
          alert('Friend request accepted automatically!');
          await refreshData();
        } else {
          alert('Friend request sent!');
          await refreshData();
        }
        friendInvitationCode = '';
      } else {
        requestError = data.error || 'Failed to send request';
        alert(requestError);
      }
    } catch (error) {
      requestError = 'Failed to send request';
      alert(requestError);
    } finally {
      sendingRequest = false;
    }
  }

  async function acceptRequest(requestId: string) {
    try {
      const res = await apiFetch(`/api/friends/requests/${requestId}/accept`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.ok) {
        await refreshData();
      } else {
        alert('Failed to accept request: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Failed to accept request');
    }
  }

  async function declineRequest(requestId: string) {
    try {
      const res = await apiFetch(`/api/friends/requests/${requestId}/decline`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.ok) {
        await refreshData();
      } else {
        alert('Failed to decline request: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Failed to decline request');
    }
  }

  async function cancelRequest(requestId: string) {
    try {
      const res = await apiFetch(`/api/friends/requests/${requestId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.ok) {
        await refreshData();
      } else {
        alert('Failed to cancel request: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Failed to cancel request');
    }
  }

  async function refreshData() {
    try {
      // Refresh friends
      const friendsRes = await apiFetch('/api/friends');
      const friendsData = await friendsRes.json();
      if (friendsData.ok) {
        friends = friendsData.friends || [];
      }

      // Refresh requests
      const requestsRes = await apiFetch('/api/friends/requests');
      const requestsData = await requestsRes.json();
      if (requestsData.ok) {
        requests = {
          sent: requestsData.sent || [],
          received: requestsData.received || []
        };
        // Update sentRequestIds based on actual sent requests
        if (requests.sent) {
          requests.sent.forEach((req: any) => {
            sentRequestIds.add(req.toUserId || req.toUser?.id);
          });
        }
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }

  onMount(() => {
    loadInvitationCode();
    // Initialize sentRequestIds from existing sent requests
    if (requests?.sent) {
      requests.sent.forEach((req: any) => {
        sentRequestIds.add(req.toUserId || req.toUser?.id);
      });
    }
  });

  function goBack() {
    goto('/dashboard');
  }

  function viewFriendProfile(friendId: string) {
    goto(`/friends/${friendId}`);
  }
</script>

<style>
  .container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    width: 100vw;
    position: relative;
    z-index: 2;
    padding: 40px 20px;
    align-items: center;
  }

  .content {
    max-width: 900px;
    width: 100%;
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(20px);
    padding: 40px;
    border-radius: 20px;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
    z-index: 3;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 30px;
  }

  h1 {
    font-family: 'Georgia', serif;
    font-size: 2.5rem;
    color: white;
    -webkit-text-stroke: 2px rgba(0, 0, 0, 0.5);
    text-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
    margin: 0;
  }

  .back-btn {
    padding: 12px 24px;
    border-radius: 20px;
    border: 2px solid rgba(0, 0, 0, 0.3);
    background: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    font-weight: 700;
    font-size: 16px;
    transition: all 0.2s ease;
    color: black;
    text-decoration: none;
  }

  .back-btn:hover {
    background: rgba(255, 255, 255, 1);
    transform: translateY(-1px);
  }

  .tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 32px;
    border-bottom: 2px solid rgba(0, 0, 0, 0.1);
    padding-bottom: 8px;
  }

  .tab {
    padding: 12px 24px;
    border-radius: 8px 8px 0 0;
    border: none;
    background: transparent;
    cursor: pointer;
    font-weight: 700;
    font-size: 16px;
    color: rgba(0, 0, 0, 0.6);
    transition: all 0.2s ease;
  }

  .tab:hover {
    background: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.8);
  }

  .tab.active {
    background: #4f46e5;
    color: white;
  }

  .tab-content {
    min-height: 300px;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: rgba(0, 0, 0, 0.6);
    font-size: 18px;
  }

  .friend-item, .request-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    margin-bottom: 12px;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 12px;
    border: 2px solid rgba(0, 0, 0, 0.1);
  }

  .friend-info, .request-info {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .friend-avatar, .request-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(255,182,193,1), rgba(186,225,255,1));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 900;
    color: white;
  }

  .friend-name, .request-name {
    font-weight: 700;
    font-size: 18px;
    color: black;
  }

  .btn-group {
    display: flex;
    gap: 8px;
  }

  .btn-small {
    padding: 8px 16px;
    border-radius: 8px;
    border: 2px solid rgba(0, 0, 0, 0.3);
    background: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    font-weight: 700;
    font-size: 14px;
    transition: all 0.2s ease;
  }

  .btn-small:hover {
    transform: translateY(-1px);
  }

  .btn-accept {
    background: #10b981;
    color: white;
    border-color: #10b981;
  }

  .btn-decline {
    background: #ef4444;
    color: white;
    border-color: #ef4444;
  }

  .btn-view {
    background: #4f46e5;
    color: white;
    border-color: #4f46e5;
  }

  .btn-sent {
    background: #10b981;
    color: white;
    border-color: #10b981;
    cursor: not-allowed;
  }

  .btn-sent:hover {
    transform: none;
  }

  .search-section, .invitation-section {
    margin-bottom: 32px;
  }

  .search-section h3, .invitation-section h3 {
    font-size: 1.5rem;
    margin-bottom: 16px;
    color: black;
  }

  .input-group {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .input {
    flex: 1;
    padding: 12px 16px;
    border-radius: 8px;
    border: 2px solid rgba(0, 0, 0, 0.3);
    font-size: 16px;
  }

  .btn-primary {
    padding: 12px 24px;
    border-radius: 8px;
    border: 2px solid #4f46e5;
    background: #4f46e5;
    color: white;
    cursor: pointer;
    font-weight: 700;
    font-size: 16px;
    transition: all 0.2s ease;
  }

  .btn-primary:hover {
    background: #4338ca;
    transform: translateY(-1px);
  }

  .invitation-code-display {
    background: rgba(0, 0, 0, 0.05);
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .code-text {
    font-family: monospace;
    font-size: 18px;
    font-weight: 900;
    color: #4f46e5;
  }

  .blobs {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
  }
</style>

<div class="blobs">
  <div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
  <div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
  <div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>
</div>

<div class="container">
  <div class="content">
    <div class="header">
      <h1>Friends</h1>
      <button class="back-btn" on:click={goBack}>← Back to Dashboard</button>
    </div>

    {#if !data?.user}
      <div class="empty-state">Please log in to manage friends.</div>
    {:else}
      <div class="tabs">
        <button class="tab" class:active={activeTab === 'friends'} on:click={() => activeTab = 'friends'}>
          Friends ({friends.length})
        </button>
        <button class="tab" class:active={activeTab === 'requests'} on:click={() => activeTab = 'requests'}>
          Requests ({requests.received.length + requests.sent.length})
        </button>
        <button class="tab" class:active={activeTab === 'add'} on:click={() => activeTab = 'add'}>
          Add Friends
        </button>
        <button class="tab" class:active={activeTab === 'orgs'} on:click={() => activeTab = 'orgs'}>
          Organizations
        </button>
      </div>

      <div class="tab-content">
        {#if activeTab === 'friends'}
          {#if friends.length === 0}
            <div class="empty-state">No friends yet. Add some friends to get started!</div>
          {:else}
            {#each friends as friend}
              <div class="friend-item">
                <div class="friend-info">
                  <div class="friend-avatar">
                    {initialFromEmail(friend.username)}
                  </div>
                  <div class="friend-name">{friend.username}</div>
                </div>
                <button class="btn-small btn-view" on:click={() => viewFriendProfile(friend.id)}>
                  View Profile
                </button>
              </div>
            {/each}
          {/if}

        {:else if activeTab === 'requests'}
          <div>
            <h3 style="margin-bottom: 16px; color: black;">Received Requests ({requests.received.length})</h3>
            {#if requests.received.length === 0}
              <div class="empty-state" style="padding: 20px;">No pending requests</div>
            {:else}
              {#each requests.received as request}
                <div class="request-item">
                  <div class="request-info">
                    <div class="request-avatar">
                      {initialFromEmail(request.fromUsername)}
                    </div>
                    <div class="request-name">{request.fromUsername}</div>
                  </div>
                  <div class="btn-group">
                    <button class="btn-small btn-accept" on:click={() => acceptRequest(request.id)}>
                      Accept
                    </button>
                    <button class="btn-small btn-decline" on:click={() => declineRequest(request.id)}>
                      Decline
                    </button>
                  </div>
                </div>
              {/each}
            {/if}

            <h3 style="margin-top: 32px; margin-bottom: 16px; color: black;">Sent Requests ({requests.sent.length})</h3>
            {#if requests.sent.length === 0}
              <div class="empty-state" style="padding: 20px;">No sent requests</div>
            {:else}
              {#each requests.sent as request}
                <div class="request-item">
                  <div class="request-info">
                    <div class="request-avatar">
                      {initialFromEmail(request.toUsername)}
                    </div>
                    <div class="request-name">{request.toUsername}</div>
                  </div>
                  <button class="btn-small" on:click={() => cancelRequest(request.id)}>
                    Cancel
                  </button>
                </div>
              {/each}
            {/if}
          </div>

        {:else if activeTab === 'add'}
          <div>
            <div class="search-section">
              <h3>Search by Email or User ID</h3>
              <div class="input-group">
                <input
                  type="text"
                  class="input"
                  placeholder="Enter email address..."
                  bind:value={searchEmail}
                  on:input={searchUsers}
                />
                <input
                  type="text"
                  class="input"
                  placeholder="Or enter 9-digit User ID..."
                  bind:value={searchUserId}
                  on:input={searchUsers}
                  maxlength="9"
                  pattern="\d{9}"
                />
                <button class="btn-primary" on:click={searchUsers} disabled={searching}>
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>

              {#if searchResults.length > 0}
                <div style="margin-top: 16px;">
                  {#each searchResults as user}
                    <div class="friend-item">
                      <div class="friend-info">
                        <div class="friend-avatar">
                          {initialFromEmail(user.username)}
                        </div>
                        <div>
                          <div class="friend-name">{user.username}</div>
                          <div style="font-size: 12px; color: rgba(0,0,0,0.6); margin-top: 2px;">ID: {user.id}</div>
                        </div>
                      </div>
                      <button
                        class="btn-small {sentRequestIds.has(user.id) ? 'btn-sent' : 'btn-view'}"
                        on:click={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[Button click] User ID:', user.id);
                          sendFriendRequest(user.id);
                        }}
                        disabled={sendingRequest || sentRequestIds.has(user.id)}
                      >
                        {sendingRequest ? 'Sending...' : sentRequestIds.has(user.id) ? '✓ Sent' : 'Send Request'}
                      </button>
                    </div>
                  {/each}
                </div>
              {:else if ((searchEmail && searchEmail.length >= 2) || (searchUserId && searchUserId.length === 9 && /^\d+$/.test(searchUserId))) && !searching}
                <div class="empty-state" style="padding: 20px;">No users found</div>
              {/if}
            </div>

            <div class="invitation-section">
              <h3>Invitation Code</h3>
              <div class="invitation-code-display">
                <div>
                  <div style="font-size: 14px; color: rgba(0,0,0,0.6); margin-bottom: 4px;">Your Invitation Code:</div>
                  {#if loadingCode}
                    <div class="code-text">Loading...</div>
                  {:else if invitationCode}
                    <div class="code-text">{invitationCode}</div>
                  {:else}
                    <div class="code-text">Failed to load</div>
                  {/if}
                </div>
                <button class="btn-primary" on:click={copyInvitationCode} disabled={!invitationCode}>
                  Copy
                </button>
              </div>

              <div style="margin-top: 16px;">
                <div style="font-size: 14px; color: rgba(0,0,0,0.6); margin-bottom: 8px;">Enter Friend's Invitation Code:</div>
                <div class="input-group">
                  <input
                    type="text"
                    class="input"
                    placeholder="Enter invitation code..."
                    bind:value={friendInvitationCode}
                    style="text-transform: uppercase;"
                  />
                  <button
                    class="btn-primary"
                    on:click={sendInvitationCodeRequest}
                    disabled={sendingRequest || !friendInvitationCode.trim()}
                  >
                    Send Request
                  </button>
                </div>
              </div>
            </div>
          </div>
        {:else if activeTab === 'orgs'}
          <div>
            <div class="search-section">
              <h3>Create Organization</h3>
              <div class="input-group">
                <input type="text" class="input" placeholder="Organization name" bind:value={orgName} />
                <input type="text" class="input" placeholder="Description (optional)" bind:value={orgDesc} />
                <button class="btn-primary" on:click={createOrganization} disabled={creatingOrg || !orgName.trim()}>
                  {creatingOrg ? 'Creating…' : 'Create'}
                </button>
              </div>
              {#if createOrgError}<div style="color:#b91c1c; font-weight:700; margin-bottom:12px;">{createOrgError}</div>{/if}
            </div>
            <div class="search-section">
              <h3>Find Organizations</h3>
              <div class="input-group">
                <input
                  type="text"
                  class="input"
                  placeholder="Search organizations by name…"
                  bind:value={orgSearch}
                  on:input={searchOrgs}
                />
                <button class="btn-primary" on:click={searchOrgs}>Search</button>
              </div>
              {#if orgResults.length === 0}
                <div class="empty-state" style="padding: 20px;">No organizations found</div>
              {:else}
                {#each orgResults as org}
                  <div class="friend-item">
                    <div class="friend-info">
                      <div class="friend-avatar">{org.name.charAt(0).toUpperCase()}</div>
                      <div>
                        <div class="friend-name">{org.name}</div>
                        {#if org.description}<div style="font-size:12px;color:rgba(0,0,0,.6)">{org.description}</div>{/if}
                      </div>
                    </div>
                    <button class="btn-small btn-view" on:click={() => requestJoin(org.id)} disabled={joiningOrgId === org.id}>
                      {joiningOrgId === org.id ? 'Requesting…' : 'Request to Join'}
                    </button>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

