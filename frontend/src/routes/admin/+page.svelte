<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import KPICard from '$lib/components/widgets/KPICard.svelte';
  import GaugeChart from '$lib/components/widgets/GaugeChart.svelte';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import DoughnutChart from '$lib/components/charts/DoughnutChart.svelte';
  import { setViewAs } from '$lib/viewAs';
  
  export let data: { stats: any; recentStats?: any };
  
  let stats = data.stats || {
    totalUsers: 0,
    totalSessions: 0,
    todaySessions: 0,
    todayActiveUsers: 0,
    adminCount: 0
  };
  
  // Update stats when data changes
  $: if (data.stats) {
    stats = data.stats;
  }
  
  let loading = false;
  let analyticsData: any = null;
  
  async function refreshStats() {
    loading = true;
    try {
      const [statsRes, analyticsRes] = await Promise.all([
        apiFetch('/api/admin/stats'),
        apiFetch('/api/admin/analytics?timeRange=7d')
      ]);
      
      const statsResult = await statsRes.json();
      const analyticsResult = await analyticsRes.json();
      
      if (statsResult.ok) {
        stats = statsResult.stats;
      }
      
      if (analyticsResult.ok) {
        analyticsData = analyticsResult.analytics;
      }
    } catch (error: any) {
      console.error('Failed to refresh stats:', error);
      alert('Failed to refresh statistics: ' + (error?.message || 'Network error'));
    } finally {
      loading = false;
    }
  }
  
  let availableOrgs: Array<{ id: string; name: string }> = [];
  let loadingOrgs = false;

  async function loadAvailableOrgs() {
    loadingOrgs = true;
    try {
      const res = await apiFetch('/api/organizations?all=1');
      const data = await res.json();
      if (data.ok) {
        availableOrgs = (data.organizations || [])
          .filter((o: any) => o.status === 'approved')
          .map((o: any) => ({ id: o.id, name: o.name }));
      }
    } catch (e) {
      console.error('Failed to load organizations:', e);
    } finally {
      loadingOrgs = false;
    }
  }

  function useAsPersonal() {
    setViewAs('personal');
    goto('/dashboard');
  }

  function useAsOrgAdmin(orgId: string) {
    setViewAs('org_admin', orgId);
    goto(`/org/${orgId}/dashboard`);
  }

  function handleOrgSelect(e: Event) {
    const target = e.currentTarget as HTMLSelectElement;
    const orgId = target.value;
    if (orgId) useAsOrgAdmin(orgId);
  }

  onMount(() => {
    loadAvailableOrgs();
  });
  
  // Generate sparklines from analytics
  let sessionsSparkline: number[] = [];
  let usersSparkline: number[] = [];
  let miniChartData: any = null;
  let gameDistributionData: any = null;
  
  $: if (analyticsData?.gamesPerDay) {
    const dates = Object.keys(analyticsData.gamesPerDay).sort().slice(-7);
    sessionsSparkline = dates.map(date => analyticsData.gamesPerDay[date]?.total || 0);
  }
  
  $: if (analyticsData?.activeUsersPerDay) {
    const dates = Object.keys(analyticsData.activeUsersPerDay).sort().slice(-7);
    usersSparkline = dates.map(date => analyticsData.activeUsersPerDay[date] || 0);
  }
  
  $: if (analyticsData?.gamesPerDay) {
    const dates = Object.keys(analyticsData.gamesPerDay).sort().slice(-7);
    miniChartData = {
      labels: dates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
      datasets: [{
        label: 'Sessions',
        data: dates.map(d => analyticsData.gamesPerDay[d]?.total || 0),
        borderColor: 'rgba(79, 70, 229, 1)',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        tension: 0.4,
        fill: true
      }]
    };
  }
  
  $: if (analyticsData?.gameTypeStats) {
    const gameTypes = Object.keys(analyticsData.gameTypeStats);
    gameDistributionData = {
      labels: gameTypes.map(gt => gt.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())),
      datasets: [{
        data: gameTypes.map(gt => analyticsData.gameTypeStats[gt].count || 0),
        backgroundColor: [
          'rgba(79, 70, 229, 0.8)',
          'rgba(34, 211, 238, 0.8)',
          'rgba(251, 191, 36, 0.8)'
        ],
        borderColor: [
          'rgba(79, 70, 229, 1)',
          'rgba(34, 211, 238, 1)',
          'rgba(251, 191, 36, 1)'
        ],
        borderWidth: 2
      }]
    };
  }
  
  onMount(() => {
    document.title = 'Admin Dashboard - SocialQ';
    refreshStats();
  });
</script>

<svelte:head>
  <title>Admin Dashboard - SocialQ</title>
</svelte:head>

<div class="dashboard">
  <div class="dashboard-header">
    <h1>Admin Dashboard</h1>
    <div class="header-actions">
      <button class="refresh-btn" on:click={refreshStats} disabled={loading}>
        {loading ? 'Refreshing...' : '🔄 Refresh'}
      </button>
      <button class="viewas-btn" on:click={useAsPersonal} title="Temporarily use the platform as a Personal user">
        👤 Use as Personal
      </button>
      {#if availableOrgs.length > 0}
        <select 
          class="viewas-select" 
          on:change={handleOrgSelect}
          title="Temporarily use the platform as an Org Admin"
        >
          <option value="">🏢 Use as Org Admin...</option>
          {#each availableOrgs as org}
            <option value={org.id}>{org.name}</option>
          {/each}
        </select>
      {/if}
    </div>
  </div>
  
  <!-- Enhanced KPI Cards with Sparklines -->
  <div class="kpi-grid">
    <KPICard
      title="Total Users"
      value={stats.totalUsers}
      icon="👥"
      color="#4f46e5"
      sparkline={usersSparkline}
    />
    
    <KPICard
      title="Total Sessions"
      value={stats.totalSessions}
      icon="🎮"
      color="#22d3ee"
      sparkline={sessionsSparkline}
    />
    
    <KPICard
      title="Sessions Today"
      value={stats.todaySessions}
      icon="📊"
      color="#f59e0b"
      trend={sessionsSparkline.length > 1 ? {
        value: Math.abs(((sessionsSparkline[sessionsSparkline.length - 1] - sessionsSparkline[0]) / Math.max(sessionsSparkline[0], 1)) * 100).toFixed(0),
        label: 'vs last week',
        isPositive: sessionsSparkline[sessionsSparkline.length - 1] >= sessionsSparkline[0]
      } : undefined}
    />
    
    <KPICard
      title="Active Users Today"
      value={stats.todayActiveUsers}
      icon="⭐"
      color="#22c55e"
      sparkline={usersSparkline}
    />
  </div>
  
  <!-- Mini Charts Row -->
  <div class="charts-row">
    {#if miniChartData}
      <div class="chart-widget">
        <h3>Sessions Trend (Last 7 Days)</h3>
        <div class="mini-chart">
          <LineChart
            data={miniChartData}
            options={{
              plugins: {
                legend: { display: false },
                tooltip: { mode: 'index' }
              },
              scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
              },
              maintainAspectRatio: false
            }}
          />
        </div>
      </div>
    {/if}
    
    {#if gameDistributionData}
      <div class="chart-widget">
        <h3>Game Distribution</h3>
        <div class="mini-chart">
          <DoughnutChart
            data={gameDistributionData}
            options={{
              cutout: '70%',
              responsive: true,
              maintainAspectRatio: true,
              aspectRatio: 1,
              layout: { padding: { top: 0, bottom: 120, left: 10, right: 0 } },
              plugins: {
                legend: {
                  display: true,
                  position: 'right',
                  labels: { boxWidth: 14, padding: 12 }
                },
                tooltip: { mode: 'index' }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    {#if analyticsData?.gameTypeStats}
      {@const gameTypes = Object.keys(analyticsData.gameTypeStats)}
      {#each gameTypes.slice(0, 1) as gameType}
        {@const gameStats = analyticsData.gameTypeStats[gameType]}
        <div class="gauge-widget">
          <h3>{gameType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h3>
          <GaugeChart
            value={gameStats.avgPercentage || 0}
            label="Avg Score"
            size={140}
            strokeWidth={12}
            color="#4f46e5"
          />
          <div class="gauge-footer">
            <span>{gameStats.count || 0} sessions</span>
          </div>
        </div>
      {/each}
    {/if}
  </div>
  
  <div class="quick-actions">
    <h2>Quick Actions</h2>
    <div class="actions-grid">
      <button class="action-btn" on:click={() => goto('/admin/users')}>
        <span class="action-icon">👤</span>
        <span class="action-label">Manage Users</span>
      </button>
      <button class="action-btn" on:click={() => goto('/admin/analytics')}>
        <span class="action-icon">📈</span>
        <span class="action-label">View Analytics</span>
      </button>
    </div>
  </div>
</div>

<style>
  .dashboard {
    max-width: 1600px;
    margin: 0 auto;
  }
  
  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  
  .dashboard-header h1 {
    font-family: Georgia, serif;
    font-size: clamp(1.5rem, 4vw, 2.5rem);
    font-weight: 800;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,.45);
    text-shadow: 0 10px 14px rgba(0,0,0,.35);
    margin: 0;
  }
  
  .header-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  
  .refresh-btn {
    padding: 0.625rem 1.25rem;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.4);
    background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.9));
    backdrop-filter: blur(16px);
    color: #4f46e5;
    font-weight: 700;
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
    border-color: rgba(79,70,229,.5);
  }
  
  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
  
  .viewas-btn {
    padding: 0.625rem 1.25rem;
    border-radius: 12px;
    border: 1px solid rgba(251, 191, 36, .4);
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    backdrop-filter: blur(16px);
    color: #92400e;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(245, 158, 11, .2);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .viewas-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(245, 158, 11, .3);
    filter: brightness(1.05);
    border-color: rgba(251, 191, 36, .6);
  }
  
  .viewas-select {
    padding: 0.625rem 2.5rem 0.625rem 1.25rem;
    border-radius: 12px;
    border: 1px solid rgba(79,70,229,.4);
    background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.9));
    backdrop-filter: blur(16px);
    color: #111;
    font-weight: 700;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(79,70,229,.15);
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 6L11 1' stroke='%234f46e5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 1rem center;
  }
  
  .viewas-select:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(79,70,229,.25);
    filter: brightness(1.02);
    border-color: rgba(79,70,229,.5);
  }
  
  .viewas-select:focus {
    outline: none;
    border-color: rgba(79,70,229,.6);
    box-shadow: 0 0 0 3px rgba(79,70,229,.1), 0 6px 16px rgba(79,70,229,.25);
  }
  
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .charts-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }
  
  .chart-widget,
  .gauge-widget {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 24px;
    padding: 1.25rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
    transition: all 0.3s ease;
    animation: fadeInUp 0.6s ease-out;
    overflow: hidden;
    min-height: 300px; /* enlarged to fit donut */
  }
  
  .chart-widget:hover,
  .gauge-widget:hover {
    transform: translateY(-4px);
    box-shadow: 0 32px 88px rgba(79,70,229,.4);
    filter: brightness(1.05);
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .chart-widget h3,
  .gauge-widget h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 1rem 0;
  }
  
  .mini-chart { height: 290px; width: 100%; } /* enlarged container for donut */
  
  /* Force canvases to fit their containers */
  :global(canvas) {
    display: block;
    max-width: 100%;
  }
  
  .gauge-widget {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  
  .gauge-footer {
    margin-top: 1rem;
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }
  
  .quick-actions {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 24px;
    padding: 1.5rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
  }
  
  .quick-actions h2 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 0.75rem 0;
  }
  
  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.75rem;
  }
  
  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 1.25rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9));
    backdrop-filter: blur(10px);
    color: #4f46e5;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .action-btn:hover {
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    color: white;
    border-color: rgba(255, 255, 255, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  }
  
  .action-icon {
    font-size: 1.25rem;
    line-height: 1;
  }
  
  .action-label {
    font-size: 0.875rem;
  }
  
  .quick-actions { margin-top: 2rem; }
  
  @media (max-width: 768px) {
    .dashboard {
      padding: 1rem;
    }
    
    .dashboard-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }
    
    .kpi-grid {
      grid-template-columns: 1fr;
    }
    
    .charts-row {
      grid-template-columns: 1fr;
    }
  }
</style>
