<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import KPICard from '$lib/components/widgets/KPICard.svelte';
  import GaugeChart from '$lib/components/widgets/GaugeChart.svelte';
  import { isViewingAsOrgAdmin, clearViewAs, getViewAsOrgId, setViewAs } from '$lib/viewAs';

  let loading = true;
  let error: string | null = null;
  let analytics: any = null;
  let orgName = '';
  let memberCount = 0;
  let members: Array<{ id: string; username: string; userId: string; role: string; status: string; joinedAt?: string; user?: { id: string; username: string } }> = [];
  let showingStudents = false;
  let showingMembers = true;
  let memberSortBy: 'name' | 'joined' | 'sessions' | 'score' = 'joined';
  let memberSortDesc = true;
  let memberFilterRole: 'all' | 'member' | 'org_admin' = 'all';
  let memberSearchQuery = '';
  let anonymizeUsernames = false;
  let selectedUserId: string = '';
  const orgId = $page.params.orgId;

  function handleUserFilterChange() {
    load();
  }

  async function load() {
    loading = true;
    error = null;
    try {
      // Load org info and members
      const [orgRes, membersRes] = await Promise.all([
        apiFetch(`/api/organizations?all=1`),
        apiFetch(`/api/organizations/${orgId}/members`)
      ]);
      
      const orgData = await orgRes.json();
      if (orgData.ok) {
        const org = orgData.organizations?.find((o: any) => o.id === orgId);
        if (org) orgName = org.name;
      }

      const membersData = await membersRes.json();
      if (membersData.ok) {
        const approvedMembers = (membersData.members || []).filter((m: any) => m.status === 'approved')
          .map((m: any) => ({
            id: m.id,
            userId: m.user?.id || '',
            username: m.user?.username || 'Unknown',
            role: m.role,
            status: m.status,
            joinedAt: m.joinedAt
          }));
        memberCount = approvedMembers.length;
        members = approvedMembers;
      }

      // Load analytics
      let analyticsUrl = `/api/admin/analytics?timeRange=30d&organizationId=${encodeURIComponent(orgId)}`;
      if (selectedUserId && selectedUserId.trim()) {
        analyticsUrl += `&userId=${encodeURIComponent(selectedUserId)}`;
      }
      const res = await apiFetch(analyticsUrl);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load analytics');
      analytics = data.analytics;
    } catch (e: any) {
      error = e?.message || 'Failed to load analytics';
    } finally {
      loading = false;
    }
  }

  function exitOrgAdminMode() {
    clearViewAs();
    goto('/admin');
  }

  function useAsPersonal() {
    setViewAs('personal');
    goto('/dashboard');
  }

  async function handleLogout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    try {
      localStorage.removeItem('email');
      localStorage.removeItem('username');
      localStorage.removeItem('userId');
      clearViewAs();
    } catch (e) {
      console.error('localStorage clear error:', e);
    }
    goto('/login');
  }

  // Prepare chart data
  let barChartData: any = null;
  let lineChartData: any = null;
  let gaugeGameTypes: Array<{ type: string; stats: any }> = [];
  let studentsWithStats: Array<{ member: any; sessions: any[]; avgScore: number }> = [];

  $: if (analytics?.gamesPerDay) {
    const dates = Object.keys(analytics.gamesPerDay).sort();
    lineChartData = {
      labels: dates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
      datasets: [{
        label: 'Sessions',
        data: dates.map(d => analytics.gamesPerDay[d]?.total || 0),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79,70,229,.15)',
        fill: true,
        tension: 0.4
      }]
    };
  }

  $: if (analytics?.gameTypeStats) {
    const gameTypes = Object.keys(analytics.gameTypeStats);
    barChartData = {
      labels: gameTypes.map(gt => gt.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase())),
      datasets: [{
        label: 'Sessions',
        data: Object.values(analytics.gameTypeStats).map((x: any) => x.count || 0),
        backgroundColor: '#22d3ee',
        borderRadius: 8
      }]
    };

    gaugeGameTypes = gameTypes.slice(0, 3).map(gt => ({
      type: gt,
      stats: analytics.gameTypeStats[gt]
    }));
  }

  // Prepare student stats with member data
  let membersWithStats: Array<{ member: any; sessions: any[]; avgScore: number; joinedAt?: string }> = [];

  // Prepare student stats
  $: if (members.length > 0 && analytics) {
    membersWithStats = members.map(member => {
      const studentSessions = (analytics.topPerformers || []).filter((p: any) => p.userId === member.userId);
      const avgScore = studentSessions.length > 0
        ? Math.round(studentSessions.reduce((sum: number, s: any) => sum + (s.avgScore || 0), 0) / studentSessions.length)
        : 0;
      return {
        member,
        sessions: studentSessions,
        avgScore,
        joinedAt: member.joinedAt
      };
    });
    studentsWithStats = membersWithStats;
  } else {
    membersWithStats = [];
    studentsWithStats = [];
  }

  // Filter and sort members (include anonymizeUsernames to force reactivity)
  $: filteredAndSortedMembers = (() => {
    // Reference anonymizeUsernames to ensure reactivity
    const _ = anonymizeUsernames;
    let filtered = membersWithStats;
    
    // Filter by role
    if (memberFilterRole !== 'all') {
      filtered = filtered.filter(m => m.member.role === memberFilterRole);
    }
    
    // Filter by search query
    if (memberSearchQuery.trim()) {
      const query = memberSearchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.member.username.toLowerCase().includes(query) || 
        m.member.userId.toLowerCase().includes(query)
      );
    }
    
    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal: any, bVal: any;
      switch (memberSortBy) {
        case 'name':
          aVal = a.member.username.toLowerCase();
          bVal = b.member.username.toLowerCase();
          break;
        case 'joined':
          aVal = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
          bVal = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
          break;
        case 'sessions':
          aVal = a.sessions.length;
          bVal = b.sessions.length;
          break;
        case 'score':
          aVal = a.avgScore;
          bVal = b.avgScore;
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return memberSortDesc ? 1 : -1;
      if (aVal > bVal) return memberSortDesc ? -1 : 1;
      return 0;
    });
    
    return filtered;
  })();

  function formatDate(dateString: string | undefined) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  function setSort(by: typeof memberSortBy) {
    if (memberSortBy === by) {
      memberSortDesc = !memberSortDesc;
    } else {
      memberSortBy = by;
      memberSortDesc = true;
    }
  }

  // Create a map of userId to anonymized index for consistent anonymization
  $: memberAnonymizeMap = (() => {
    const map = new Map<string, number>();
    members.forEach((member, index) => {
      map.set(member.userId, index + 1);
    });
    return map;
  })();

  // Function to get anonymized username
  function getDisplayUsername(member: any): string {
    if (anonymizeUsernames) {
      const index = memberAnonymizeMap.get(member.userId) || 0;
      return `User ${index}`;
    }
    return member.username || 'Unknown';
  }

  // Function to get anonymized user ID
  function getDisplayUserId(member: any): string {
    if (anonymizeUsernames) {
      const index = memberAnonymizeMap.get(member.userId) || 0;
      return `ID-${index}`;
    }
    return member.userId || '';
  }

  $: $page.params.orgId, load();
</script>

<div class="org-dashboard">
  <!-- Custom Header -->
  <div class="org-header">
    <div class="org-header-content">
      <div class="org-title-section">
        <h1>{orgName || 'Organization'} Dashboard</h1>
        {#if orgId}
          <span class="org-id">ID: {orgId}</span>
        {/if}
      </div>
      <div class="org-header-actions">
        {#if isViewingAsOrgAdmin()}
          <button class="exit-org-btn" on:click={exitOrgAdminMode} title="Exit Org Admin view">
            ← Back to Admin
          </button>
        {/if}
        <button class="header-action-btn use-personal-btn" on:click={useAsPersonal} title="Use as Personal user">
          👤 Use as Personal
        </button>
        <button class="header-action-btn logout-btn" on:click={handleLogout} title="Logout">
          🚪 Logout
        </button>
        <button class="refresh-btn" on:click={load} disabled={loading}>
          {loading ? '⏳' : '🔄'} {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    </div>
  </div>

  {#if loading}
    <div class="card" style="margin: 2rem;">Loading…</div>
  {:else if error}
    <div class="card error" style="margin: 2rem;">{error}</div>
  {:else}
    <!-- Members Section (Always visible at top) -->
    {#if members.length > 0}
      <div class="members-section" style="margin-top: 0; padding-top: 2rem;">
        <div class="section-header">
          <h2>Organization Members</h2>
          <div class="header-controls">
            <label class="anonymize-checkbox">
              <input type="checkbox" bind:checked={anonymizeUsernames} />
              <span>Anonymize Usernames</span>
            </label>
            <button class="toggle-btn" on:click={() => showingMembers = !showingMembers}>
              {showingMembers ? 'Hide' : 'Show'} Members ({members.length})
            </button>
          </div>
        </div>
        
        {#if showingMembers}
          <!-- Filters and Search -->
          <div class="members-filters">
            <input
              type="text"
              class="member-search"
              placeholder="Search by name or ID..."
              bind:value={memberSearchQuery}
            />
            <select class="member-filter" bind:value={memberFilterRole}>
              <option value="all">All Roles</option>
              <option value="member">Members</option>
              <option value="org_admin">Admins</option>
            </select>
            <select class="member-filter" bind:value={memberSortBy}>
              <option value="joined">Sort by: Join Date</option>
              <option value="name">Sort by: Name</option>
              <option value="sessions">Sort by: Sessions</option>
              <option value="score">Sort by: Avg Score</option>
            </select>
            <button class="sort-toggle" on:click={() => memberSortDesc = !memberSortDesc}>
              {memberSortDesc ? '↓ Desc' : '↑ Asc'}
            </button>
          </div>

          <!-- Members Table -->
          <div class="members-table-container">
            <table class="members-table">
              <thead>
                <tr>
                  <th class="sortable" on:click={() => setSort('name')}>
                    Name {memberSortBy === 'name' ? (memberSortDesc ? '↓' : '↑') : ''}
                  </th>
                  <th>User ID</th>
                  <th class="sortable" on:click={() => setSort('joined')}>
                    Joined {memberSortBy === 'joined' ? (memberSortDesc ? '↓' : '↑') : ''}
                  </th>
                  <th>Role</th>
                  <th class="sortable" on:click={() => setSort('sessions')}>
                    Sessions {memberSortBy === 'sessions' ? (memberSortDesc ? '↓' : '↑') : ''}
                  </th>
                  <th class="sortable" on:click={() => setSort('score')}>
                    Avg Score {memberSortBy === 'score' ? (memberSortDesc ? '↓' : '↑') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {#if filteredAndSortedMembers.length === 0}
                  <tr>
                    <td colspan="6" class="empty-row">No members found matching filters.</td>
                  </tr>
                {:else}
                  {#each filteredAndSortedMembers as { member, sessions, avgScore, joinedAt }}
                    {@const displayUsername = anonymizeUsernames ? `User ${memberAnonymizeMap.get(member.userId) || 0}` : (member.username || 'Unknown')}
                    {@const displayUserId = anonymizeUsernames ? `ID-${memberAnonymizeMap.get(member.userId) || 0}` : (member.userId || '')}
                    <tr>
                      <td class="member-name-cell">
                        <div class="member-name-row">
                          <div class="member-avatar-small">
                            {displayUsername.charAt(0).toUpperCase()}
                          </div>
                          <span>{displayUsername}</span>
                        </div>
                      </td>
                      <td class="member-id-cell">{displayUserId}</td>
                      <td class="member-date-cell">{formatDate(joinedAt)}</td>
                      <td class="member-role-cell">
                        {#if member.role === 'org_admin'}
                          <span class="role-badge admin">Admin</span>
                        {:else}
                          <span class="role-badge member">Member</span>
                        {/if}
                      </td>
                      <td class="member-sessions-cell">{sessions.length}</td>
                      <td class="member-score-cell">
                        <span class="score-value">{avgScore}%</span>
                      </td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {:else}
      <div class="members-section" style="margin-top: 0; padding-top: 2rem;">
        <div class="section-header">
          <h2>Organization Members</h2>
        </div>
        <div class="card" style="margin: 0;">No members in this organization yet.</div>
      </div>
    {/if}

    <!-- User Filter for Analytics -->
    {#if members.length > 0}
      <div class="analytics-filter-section">
        <div class="analytics-filter-header">
          <h2>Statistics Filter</h2>
          <div class="user-filter-controls">
            <label class="user-filter-label">
              <span>Filter by User:</span>
              <select class="user-filter-select" bind:value={selectedUserId} on:change={handleUserFilterChange}>
                <option value="">All Users</option>
                {#each members as member, index}
                  {@const userIndex = memberAnonymizeMap.get(member.userId) || (index + 1)}
                  {@const displayName = anonymizeUsernames ? `User ${userIndex}` : (member.username || 'Unknown')}
                  <option value={member.userId}>{displayName}</option>
                {/each}
              </select>
            </label>
            {#if selectedUserId && selectedUserId.trim()}
              <button class="clear-filter-btn" on:click={() => { selectedUserId = ''; handleUserFilterChange(); }}>
                Clear Filter
              </button>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    {#if !analytics || Object.keys(analytics.gamesPerDay || {}).length === 0}
      <div class="card" style="margin: 2rem;">No activity yet for this organization{selectedUserId && selectedUserId.trim() ? ' for the selected user' : ''}.</div>
    {:else}
      <!-- KPI Cards -->
      <div class="kpi-grid">
        <KPICard
          title="Total Sessions"
          value={analytics.totalSessions || 0}
          icon="📊"
          color="#4f46e5"
        />
        
        <KPICard
          title="Total Members"
          value={memberCount}
          icon="👥"
          color="#22c55e"
        />

        {#if analytics.gameTypeStats}
          {@const gameTypes = Object.keys(analytics.gameTypeStats)}
          {@const totalGames = gameTypes.reduce((sum, gt) => sum + (analytics.gameTypeStats[gt]?.count || 0), 0)}
          <KPICard
            title="Total Games"
            value={totalGames}
            icon="🎮"
            color="#f59e0b"
          />
        {/if}

        {#if analytics.gameTypeStats}
          {@const gameTypes = Object.keys(analytics.gameTypeStats)}
          {@const avgScore = gameTypes.reduce((sum, gt) => {
            const stats = analytics.gameTypeStats[gt];
            return sum + (stats?.avgPercentage || 0);
          }, 0) / Math.max(gameTypes.length, 1)}
          <KPICard
            title="Avg Score"
            value={`${avgScore.toFixed(1)}%`}
            icon="⭐"
            color="#8b5cf6"
          />
        {/if}
      </div>

      <!-- Charts Row -->
      <div class="charts-row">
        {#if lineChartData}
          <div class="chart-card">
            <h3>Sessions Over Time</h3>
            <div class="chart-container">
              <LineChart
                data={lineChartData}
                options={{ 
                  maintainAspectRatio: false, 
                  plugins: { 
                    legend: { display: false },
                    tooltip: { mode: 'index' }
                  },
                  scales: {
                    y: { beginAtZero: true }
                  }
                }}
              />
            </div>
          </div>
        {/if}

        {#if barChartData}
          <div class="chart-card">
            <h3>Games by Type</h3>
            <div class="chart-container">
              <BarChart
                data={barChartData}
                options={{ 
                  maintainAspectRatio: false, 
                  plugins: { 
                    legend: { display: false },
                    tooltip: { mode: 'index' }
                  },
                  scales: {
                    y: { beginAtZero: true }
                  }
                }}
              />
            </div>
          </div>
        {/if}
      </div>

      {#if gaugeGameTypes.length > 0}
        <div class="gauges-row">
          {#each gaugeGameTypes as { type, stats }}
            <div class="gauge-widget">
              <h3>{type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h3>
              <GaugeChart
                value={stats.avgPercentage || 0}
                label="Avg Score"
                size={140}
                strokeWidth={12}
                color="#4f46e5"
              />
              <div class="gauge-footer">
                <span>{stats.count || 0} sessions</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    {/if}
  {/if}
</div>

<style>
  :global(body) {
    overflow-y: auto !important;
    overflow-x: hidden !important;
  }

  :global(html) {
    overflow-y: auto !important;
    overflow-x: hidden !important;
  }

  .org-dashboard {
    width: 100%;
    margin: 0;
    padding: 0;
    min-height: 100vh;
    height: auto;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #00f2fe 100%);
    background-size: 400% 400%;
    background-attachment: fixed;
    animation: gradient 45s ease infinite;
    padding-bottom: 2rem;
  }

  .org-header {
    background: linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,.25));
    backdrop-filter: blur(24px) saturate(140%);
    border-bottom: 1px solid rgba(255,255,255,.4);
    box-shadow: 0 8px 32px rgba(0,0,0,.12);
    padding: 1.5rem 2rem;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .org-header-content {
    width: 100%;
    margin: 0;
    padding: 0 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 2rem;
  }

  .org-title-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .org-title-section h1 {
    font-family: Georgia, serif;
    font-size: clamp(1.75rem, 3vw, 2.25rem);
    font-weight: 800;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,.4);
    text-shadow: 0 8px 16px rgba(0,0,0,.3);
    margin: 0;
    line-height: 1.2;
  }

  .org-id {
    font-size: 0.875rem;
    color: rgba(255,255,255,0.9);
    font-weight: 500;
    font-family: monospace;
    letter-spacing: 0.5px;
  }

  .org-header-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .exit-org-btn {
    padding: 0.625rem 1.25rem;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,.4);
    background: linear-gradient(135deg, rgba(254,243,199,.95), rgba(253,230,138,.95));
    backdrop-filter: blur(16px);
    color: #92400e;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(245,158,11,.2);
  }

  .exit-org-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(245,158,11,.3);
    filter: brightness(1.05);
  }

  .header-action-btn {
    padding: 0.625rem 1.25rem;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,.4);
    background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.9));
    backdrop-filter: blur(16px);
    color: #111;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(79,70,229,.15);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .header-action-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(79,70,229,.25);
    filter: brightness(1.02);
    border-color: rgba(79,70,229,.5);
  }

  .use-personal-btn {
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    color: #92400e;
    border-color: rgba(251, 191, 36, .4);
    box-shadow: 0 4px 12px rgba(245, 158, 11, .2);
  }

  .use-personal-btn:hover {
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    box-shadow: 0 6px 16px rgba(245, 158, 11, .3);
    filter: brightness(1.05);
    border-color: rgba(251, 191, 36, .6);
  }

  .logout-btn {
    background: linear-gradient(135deg, #fee2e2, #fecaca);
    color: #991b1b;
    border-color: rgba(239, 68, 68, .4);
    box-shadow: 0 4px 12px rgba(239, 68, 68, .2);
  }

  .logout-btn:hover {
    background: linear-gradient(135deg, #fee2e2, #fecaca);
    box-shadow: 0 6px 16px rgba(239, 68, 68, .3);
    filter: brightness(1.05);
    border-color: rgba(239, 68, 68, .6);
  }

  .refresh-btn {
    padding: 0.625rem 1.25rem;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,.4);
    background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.9));
    backdrop-filter: blur(16px);
    color: #111;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(79,70,229,.15);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .refresh-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(79,70,229,.25);
    filter: brightness(1.02);
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @keyframes gradient {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }


  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1.25rem;
    margin-bottom: 2rem;
    padding: 2rem 2rem 0 2rem;
  }

  .charts-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
    padding: 0 2rem;
  }

  .chart-card {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20));
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 24px;
    padding: 1.5rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
    height: 360px;
    display: flex;
    flex-direction: column;
  }

  .chart-card h3 {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 700;
    color: #4f46e5;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chart-container {
    flex: 1;
    position: relative;
    min-height: 260px;
  }

  .gauges-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
    padding: 0 2rem;
  }

  .gauge-widget {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20));
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 24px;
    padding: 1.5rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .gauge-widget h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 700;
    color: #4f46e5;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .gauge-footer {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
  }

  .card {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20));
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 16px;
    padding: 2rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
    text-align: center;
    color: rgba(255,255,255,0.95);
    font-size: 1rem;
  }

  .error {
    color: #ef4444;
    background: rgba(239,68,68,0.1);
    border-color: rgba(239,68,68,0.3);
  }

  .students-section {
    margin-top: 2rem;
    padding: 0 2rem;
    width: 100%;
    box-sizing: border-box;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .anonymize-checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,.3);
    background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.90));
    backdrop-filter: blur(22px) saturate(140%);
    box-shadow: 0 4px 12px rgba(79,70,229,.16);
    color: #111;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
    user-select: none;
  }

  .anonymize-checkbox:hover {
    transform: translateY(-1px);
    filter: brightness(1.05);
  }

  .anonymize-checkbox input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: #4f46e5;
  }

  .anonymize-checkbox span {
    white-space: nowrap;
  }

  .section-header h2 {
    font-family: Georgia, serif;
    font-size: 1.75rem;
    font-weight: 700;
    color: white;
    -webkit-text-stroke: 1px rgba(0,0,0,.3);
    text-shadow: 0 4px 8px rgba(0,0,0,.2);
    margin: 0;
  }

  .toggle-btn {
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,.3);
    background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.90));
    backdrop-filter: blur(22px) saturate(140%);
    box-shadow: 0 4px 12px rgba(79,70,229,.16);
    color: #111;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .toggle-btn:hover {
    transform: translateY(-1px);
    filter: brightness(1.05);
  }

  .students-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.25rem;
  }

  .student-card {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20));
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 16px;
    padding: 1.25rem;
    box-shadow: 0 12px 40px rgba(0,0,0,.2);
    backdrop-filter: blur(22px) saturate(140%);
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .student-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 48px rgba(0,0,0,.25);
  }

  .student-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .student-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .student-info {
    flex: 1;
    min-width: 0;
  }

  .student-name {
    font-weight: 600;
    color: #111;
    font-size: 1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .student-id {
    font-size: 0.75rem;
    color: #6b7280;
    font-family: monospace;
  }

  .student-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    color: #92400e;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .student-stats {
    display: flex;
    gap: 1.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(0,0,0,.08);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: #4f46e5;
  }

  .members-filters {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .member-search {
    flex: 1;
    min-width: 200px;
    padding: 0.625rem 1rem;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,.4);
    background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.9));
    backdrop-filter: blur(16px);
    color: #111;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .member-search::placeholder {
    color: #9ca3af;
  }

  .member-filter {
    padding: 0.625rem 1rem;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,.4);
    background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.9));
    backdrop-filter: blur(16px);
    color: #111;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .member-filter:hover {
    filter: brightness(1.02);
    border-color: rgba(79,70,229,.5);
  }

  .sort-toggle {
    padding: 0.625rem 1rem;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,.4);
    background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.9));
    backdrop-filter: blur(16px);
    color: #111;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .sort-toggle:hover {
    filter: brightness(1.02);
    border-color: rgba(79,70,229,.5);
  }

  .members-section {
    width: 100%;
    box-sizing: border-box;
    margin-top: 2rem;
    padding: 0 2rem;
  }

  .members-table-container {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20));
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 20px;
    padding: 1.5rem;
    box-shadow: 0 12px 40px rgba(0,0,0,.2);
    backdrop-filter: blur(22px) saturate(140%);
    overflow-x: auto;
    overflow-y: auto;
    max-height: 600px;
    width: 100%;
    box-sizing: border-box;
  }

  .members-table {
    width: 100%;
    min-width: 100%;
    border-collapse: collapse;
    table-layout: auto;
  }

  .members-table th {
    text-align: left;
    padding: 0.875rem 1.25rem;
    font-weight: 700;
    font-size: 0.75rem;
    color: #4f46e5;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid rgba(79, 70, 229, 0.2);
    background: linear-gradient(135deg, rgba(79, 70, 229, 0.05), rgba(34, 211, 238, 0.05));
    white-space: nowrap;
    min-width: fit-content;
  }

  .members-table th.sortable {
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }

  .members-table th.sortable:hover {
    background: linear-gradient(135deg, rgba(79, 70, 229, 0.1), rgba(34, 211, 238, 0.1));
  }

  .members-table td {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(0,0,0,.08);
    font-size: 0.875rem;
    white-space: nowrap;
    min-width: fit-content;
  }

  .members-table tbody tr:hover {
    background: rgba(79, 70, 229, 0.05);
    transition: background 0.15s;
  }

  .member-name-cell {
    font-weight: 600;
    color: #111;
    min-width: 200px;
  }

  .member-name-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .member-avatar-small {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  .member-id-cell {
    font-family: monospace;
    color: #6b7280;
    font-size: 0.8rem;
    min-width: 120px;
  }

  .member-date-cell {
    color: #6b7280;
    min-width: 120px;
  }

  .member-role-cell {
    font-size: 0.8rem;
  }

  .role-badge {
    padding: 0.25rem 0.625rem;
    border-radius: 6px;
    font-weight: 700;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .role-badge.admin {
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    color: #92400e;
  }

  .role-badge.member {
    background: linear-gradient(135deg, #dbeafe, #bfdbfe);
    color: #1e40af;
  }

  .member-sessions-cell {
    color: #111;
    font-weight: 600;
    text-align: center;
    min-width: 100px;
  }

  .member-score-cell {
    text-align: center;
    min-width: 120px;
  }

  .member-role-cell {
    min-width: 100px;
  }

  .score-value {
    font-weight: 700;
    color: #4f46e5;
    font-size: 1rem;
  }

  .empty-row {
    text-align: center;
    padding: 2rem;
    color: #9ca3af;
    font-size: 0.875rem;
  }

  .analytics-filter-section {
    width: 100%;
    box-sizing: border-box;
    margin-top: 2rem;
    padding: 0 2rem;
  }

  .analytics-filter-header {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20));
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 20px;
    padding: 1.5rem;
    box-shadow: 0 12px 40px rgba(0,0,0,.2);
    backdrop-filter: blur(22px) saturate(140%);
  }

  .analytics-filter-header h2 {
    font-family: Georgia, serif;
    font-size: 1.75rem;
    font-weight: 700;
    color: white;
    -webkit-text-stroke: 1px rgba(0,0,0,.3);
    text-shadow: 0 4px 8px rgba(0,0,0,.2);
    margin: 0 0 1rem 0;
  }

  .user-filter-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .user-filter-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 600;
    color: white;
    font-size: 0.95rem;
  }

  .user-filter-label span {
    white-space: nowrap;
  }

  .user-filter-select {
    padding: 0.625rem 1rem;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,.4);
    background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.9));
    backdrop-filter: blur(16px);
    color: #111;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 200px;
  }

  .user-filter-select:hover {
    filter: brightness(1.02);
    border-color: rgba(79,70,229,.5);
  }

  .user-filter-select:focus {
    outline: none;
    border-color: rgba(79,70,229,.7);
    box-shadow: 0 0 0 3px rgba(79,70,229,.2);
  }

  .clear-filter-btn {
    padding: 0.625rem 1rem;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,.4);
    background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.9));
    backdrop-filter: blur(16px);
    color: #111;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .clear-filter-btn:hover {
    filter: brightness(1.05);
    border-color: rgba(239,68,68,.5);
    background: linear-gradient(180deg, rgba(254,226,226,.95), rgba(254,202,202,.9));
  }
</style>
