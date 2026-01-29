<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import LineChart from '$lib/components/charts/LineChart.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import TrashDeleteButton from '$lib/components/TrashDeleteButton.svelte';
  
  export let data: { user: any; stats: any; friends?: any; collages?: any; organizations?: any[] };
  
  let user = data.user;
  let stats = data.stats;
  let friends = data.friends || { count: 0, list: [] };
  let collages = data.collages || { count: 0, list: [] };
  let organizations: Array<{ id: string; name: string; status: string; role: string; membershipStatus: string; joinedAt: string }> = data.organizations || [];
  
  // Update user and stats when data changes
  $: if (data.user) {
    user = data.user;
  }
  $: if (data.stats) {
    stats = data.stats;
  }
  $: if (data.friends) {
    friends = data.friends;
  }
  $: if (data.collages) {
    collages = data.collages;
  }
  $: if (data.organizations) {
    organizations = data.organizations;
  }
  
  let loading = false;
  let error: string | null = null;
  let deletingPhoto: Record<string, boolean> = {};
  
  // Emotion categories for photos
  const EMOTIONS = ['Angry', 'Disgust', 'Fear', 'Happy', 'Sad', 'Surprise'];
  let selectedEmotion = 'All';
  
  // Group collages by emotion
  function groupByEmotion(collagesObj: { count: number; list: any[] }) {
    const groups: Record<string, any[]> = {};
    
    // Initialize all emotion groups
    EMOTIONS.forEach(emotion => {
      groups[emotion] = [];
    });
    groups['All'] = [];
    
    collagesObj.list?.forEach((collage: any) => {
      // Add to "All" category
      groups['All'].push(collage);
      
      // Parse emotions if it's a JSON string
      let emotions: string[] = [];
      if (collage.emotions) {
        try {
          emotions = typeof collage.emotions === 'string' 
            ? JSON.parse(collage.emotions) 
            : collage.emotions;
        } catch {
          // Invalid JSON, ignore
        }
      }
      
      // Add to each emotion category if the collage contains that emotion
      if (Array.isArray(emotions)) {
        emotions.forEach((emotion: string) => {
          const normalizedEmotion = emotion.charAt(0).toUpperCase() + emotion.slice(1).toLowerCase();
          if (groups[normalizedEmotion]) {
            groups[normalizedEmotion].push(collage);
          }
        });
      }
    });
    
    return groups;
  }
  
  $: groupedCollages = groupByEmotion(collages);
  $: currentCollages = groupedCollages[selectedEmotion] || [];

  async function deletePhoto(collageId: string) {
    deletingPhoto[collageId] = true;
    try {
      const res = await apiFetch(`/api/collages/${collageId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (data.ok) {
        // Remove from local array
        collages.list = collages.list.filter((c: any) => c.id !== collageId);
        collages.count = Math.max(0, collages.count - 1);
      } else {
        alert('Failed to delete photo: ' + (data.error || 'Unknown error'));
      }
    } catch (e: any) {
      console.error('Error deleting photo:', e);
      alert('Failed to delete photo: ' + (e?.message || 'Network error'));
    } finally {
      deletingPhoto[collageId] = false;
    }
  }
  
  // Prepare chart data
  let scoreProgressionData: any = null;
  let avgScoresByDifficultyData: any = null;
  
  $: if (stats?.timeSeriesData) {
    // Score progression over time (line chart)
    const gameTypes = Object.keys(stats.timeSeriesData);
    const datasets = gameTypes.map((gameType, idx) => {
      const sessions = stats.timeSeriesData[gameType];
      const colors = [
        { bg: 'rgba(79, 70, 229, 0.2)', border: 'rgba(79, 70, 229, 1)' },
        { bg: 'rgba(34, 211, 238, 0.2)', border: 'rgba(34, 211, 238, 1)' },
        { bg: 'rgba(251, 191, 36, 0.2)', border: 'rgba(251, 191, 36, 1)' }
      ];
      const color = colors[idx % colors.length];
      
      return {
        label: gameType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        data: sessions.map((s: any) => s.percentage),
        borderColor: color.border,
        backgroundColor: color.bg,
        tension: 0.1,
        fill: true
      };
    });
    
    if (gameTypes.length > 0) {
      const labels = stats.timeSeriesData[gameTypes[0]].map((s: any) => {
        const date = new Date(s.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
      
      scoreProgressionData = {
        labels,
        datasets
      };
    }
  }
  
  $: if (stats?.difficultyStats && Object.keys(stats.difficultyStats).length > 0) {
    // Average scores by difficulty/level (bar chart)
    const gameTypes = Object.keys(stats.difficultyStats);
    const allDifficulties = new Set<string>();
    gameTypes.forEach(gameType => {
      if (stats.difficultyStats[gameType]) {
        Object.keys(stats.difficultyStats[gameType]).forEach(diff => allDifficulties.add(diff));
      }
    });
    
    if (allDifficulties.size > 0) {
      const labels = Array.from(allDifficulties);
      const datasets = gameTypes.map((gameType, idx) => {
        const colors = [
          { bg: 'rgba(79, 70, 229, 0.8)', border: 'rgba(79, 70, 229, 1)' },
          { bg: 'rgba(34, 211, 238, 0.8)', border: 'rgba(34, 211, 238, 1)' },
          { bg: 'rgba(251, 191, 36, 0.8)', border: 'rgba(251, 191, 36, 1)' }
        ];
        const color = colors[idx % colors.length];
        
        return {
          label: gameType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          data: labels.map(label => {
            const gameStats = stats.difficultyStats[gameType];
            return gameStats && gameStats[label] ? gameStats[label].avgPercentage : 0;
          }),
          backgroundColor: color.bg,
          borderColor: color.border,
          borderWidth: 1
        };
      });
      
      if (datasets.length > 0) {
        avgScoresByDifficultyData = {
          labels,
          datasets
        };
      }
    }
  }
  
  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  function formatGameType(gameType: string) {
    return gameType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
  
  // Photo sources for facial recognition
  let photoSourceSettings = { ekman: true, own: true, synthetic: true };
  let savingPhotoSources = false;
  let loadingPhotoSources = false;

  async function loadPhotoSources() {
    if (!user?.id) return;
    loadingPhotoSources = true;
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}/photo-sources`);
      const data = await res.json();
      if (data.ok && data.photoSourceSettings) {
        photoSourceSettings = { ...data.photoSourceSettings };
      }
    } catch (e) {
      console.error('Error loading photo sources:', e);
    } finally {
      loadingPhotoSources = false;
    }
  }

  async function savePhotoSources() {
    if (!user?.id) return;
    savingPhotoSources = true;
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}/photo-sources`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(photoSourceSettings)
      });
      const data = await res.json();
      if (data.ok) {
        photoSourceSettings = { ...data.photoSourceSettings };
        alert('Photo sources saved.');
      } else {
        alert('Failed to save: ' + (data.error || 'Unknown error'));
      }
    } catch (e: any) {
      alert('Failed to save: ' + (e?.message || 'Network error'));
    } finally {
      savingPhotoSources = false;
    }
  }

  onMount(() => {
    if (user) {
      document.title = `${user.username} - User Details - Admin Panel`;
      loadPhotoSources();
    }
  });
</script>

<svelte:head>
  <title>{user ? `${user.username} - User Details` : 'User Details'} - Admin Panel</title>
</svelte:head>

<div class="user-detail-page">
  {#if loading}
    <div class="loading-state">
      <p>Loading user data...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <p>{error}</p>
      <button class="back-btn" on:click={() => goto('/admin/users')}>← Back to Users</button>
    </div>
  {:else if !user || !stats}
    <div class="error-state">
      <p>User not found or unable to load user data.</p>
      <button class="back-btn" on:click={() => goto('/admin/users')}>← Back to Users</button>
    </div>
  {:else}
    <div class="page-header">
      <h1>User Details: {user.username}</h1>
      <button class="back-btn" on:click={() => goto('/admin/users')}>← Back to Users</button>
    </div>
    
    <div class="user-info-card">
      <h2>User Information</h2>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Email/Username:</span>
          <span class="info-value">{user.username}</span>
        </div>
        <div class="info-item">
          <span class="info-label">User ID:</span>
          <span class="info-value">{user.id}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Role:</span>
          <span class="info-value role-badge" class:admin={user.role === 'admin'}>
            {user.role}
          </span>
        </div>
        <div class="info-item">
          <span class="info-label">Created:</span>
          <span class="info-value">{formatDate(user.createdAt)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Total Sessions:</span>
          <span class="info-value">{stats.totalSessions}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Total Friends:</span>
          <span class="info-value">{friends.count || 0}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Total Photos:</span>
          <span class="info-value">{collages.count || 0}</span>
        </div>
        {#if organizations && organizations.length > 0}
          <div class="info-item info-item-full">
            <span class="info-label">Organizations:</span>
            <div class="organizations-list">
              {#each organizations as org (org.id)}
                <a href="/admin/organizations?org={org.id}" class="org-tag" title="{org.name} – {org.role} ({org.membershipStatus})">
                  {org.name}
                  {#if org.role === 'org_admin'}
                    <span class="org-role-badge">admin</span>
                  {/if}
                </a>
              {/each}
            </div>
          </div>
        {:else}
          <div class="info-item">
            <span class="info-label">Organizations:</span>
            <span class="info-value info-value-muted">None</span>
          </div>
        {/if}
      </div>
    </div>

    <div class="user-info-card photo-sources-card">
      <h2>Photo sources for facial recognition</h2>
      <p class="photo-sources-help">Choose which image sources this user can see in the facial recognition quiz.</p>
      {#if loadingPhotoSources}
        <p class="loading-inline">Loading...</p>
      {:else}
        <div class="photo-sources-checkboxes">
          <label class="photo-source-checkbox">
            <input type="checkbox" bind:checked={photoSourceSettings.ekman} />
            <span>Ekman / reference photos</span>
          </label>
          <label class="photo-source-checkbox">
            <input type="checkbox" bind:checked={photoSourceSettings.own} />
            <span>Own photos and friends' photos</span>
          </label>
          <label class="photo-source-checkbox">
            <input type="checkbox" bind:checked={photoSourceSettings.synthetic} />
            <span>Generated (synthetic) photos</span>
          </label>
        </div>
        <button class="save-photo-sources-btn" on:click={savePhotoSources} disabled={savingPhotoSources}>
          {savingPhotoSources ? 'Saving...' : 'Save'}
        </button>
      {/if}
    </div>
    
    {#if friends.list && friends.list.length > 0}
      <div class="friends-section">
        <h2>Friends ({friends.count})</h2>
        <div class="friends-list">
          {#each friends.list as friend (friend.id)}
            <div class="friend-card">
              <div class="friend-info">
                <span class="friend-email">{friend.username}</span>
                <span class="friend-id">ID: {friend.id}</span>
              </div>
              <span class="friend-date">Connected: {formatDate(friend.connectedAt)}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    
    {#if collages.list && collages.list.length > 0}
      <div class="photos-section">
        <h2>Uploaded Photos ({collages.count})</h2>
        <div class="emotion-tabs">
          {#each ['All', ...EMOTIONS] as emotion}
            <button
              class="emotion-tab"
              class:active={selectedEmotion === emotion}
              on:click={() => selectedEmotion = emotion}
            >
              {emotion}
              {#if emotion !== 'All'}
                <span class="emotion-count">({groupedCollages[emotion]?.length || 0})</span>
              {/if}
            </button>
          {/each}
        </div>
        <div class="photos-grid">
          {#each currentCollages as collage (collage.id)}
            <div class="photo-card">
              <div class="photo-image-wrapper">
                <img src={collage.imageUrl} alt="User photo" loading="lazy" />
                <div class="delete-photo-btn-wrapper">
                  <TrashDeleteButton
                    confirmMessage="Are you sure you want to delete this photo? This action cannot be undone."
                    onConfirm={() => deletePhoto(collage.id)}
                    disabled={deletingPhoto[collage.id]}
                    loading={deletingPhoto[collage.id]}
                    title="Delete this photo"
                  />
                </div>
              </div>
              <div class="photo-info">
                <span class="photo-date">{formatDate(collage.createdAt)}</span>
                {#if collage.emotions}
                  {@const emotions = typeof collage.emotions === 'string' ? JSON.parse(collage.emotions) : collage.emotions}
                  {#if Array.isArray(emotions) && emotions.length > 0}
                    <span class="photo-emotions">{emotions.join(', ')}</span>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    
    {#if stats.gameTypeStats && Object.keys(stats.gameTypeStats).length > 0}
      <div class="stats-section">
        <h2>Performance by Game Type</h2>
        <div class="game-type-stats">
          {#each Object.entries(stats.gameTypeStats) as [gameType, gameStats]}
            <div class="game-stat-card">
              <h3>{formatGameType(gameType)}</h3>
              <div class="stat-metrics">
                <div class="metric">
                  <span class="metric-label">Games Played:</span>
                  <span class="metric-value">{gameStats?.count || 0}</span>
                </div>
                <div class="metric">
                  <span class="metric-label">Average Score:</span>
                  <span class="metric-value">{(gameStats?.avgPercentage || 0).toFixed(1)}%</span>
                </div>
                <div class="metric">
                  <span class="metric-label">Total Questions:</span>
                  <span class="metric-value">{gameStats?.totalQuestions || 0}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    
    {#if scoreProgressionData}
      <div class="chart-section">
        <h2>Score Progression Over Time</h2>
        <div class="chart-card">
          <LineChart
            data={scoreProgressionData}
            options={{
              plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  ticks: {
                    callback: function(value) {
                      return value + '%';
                    }
                  }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    {#if avgScoresByDifficultyData}
      <div class="chart-section">
        <h2>Average Scores by Difficulty/Level</h2>
        <div class="chart-card">
          <BarChart
            data={avgScoresByDifficultyData}
            options={{
              plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { mode: 'index', intersect: false }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  ticks: {
                    callback: function(value) {
                      return value + '%';
                    }
                  }
                }
              }
            }}
          />
        </div>
      </div>
    {/if}
    
    <div class="history-section">
      <h2>Recent Game History</h2>
      <div class="history-table-container">
        {#if stats.recentSessions && Array.isArray(stats.recentSessions) && stats.recentSessions.length > 0}
          <table class="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Game Type</th>
                <th>Difficulty/Level</th>
                <th>Score</th>
                <th>Time</th>
                <th>Avg Time/Question</th>
              </tr>
            </thead>
            <tbody>
              {#each stats.recentSessions as session (session.id)}
                <tr>
                  <td>{formatDate(session.createdAt)}</td>
                  <td>{formatGameType(session.gameType)}</td>
                  <td>{session.difficulty || session.level || 'N/A'}</td>
                  <td>{session.score}/{session.total} ({(session.total > 0 ? (session.score / session.total) * 100 : 0).toFixed(1)}%)</td>
                  <td>
                    {#if session.timeMs}
                      {Math.round(session.timeMs / 1000)}s
                    {:else}
                      N/A
                    {/if}
                  </td>
                  <td>
                    {#if session.timeMs && session.total > 0}
                      {(session.timeMs / session.total / 1000).toFixed(1)}s/q
                    {:else}
                      N/A
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="empty-state">No game sessions found.</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .user-detail-page {
    max-width: 1600px;
    margin: 0 auto;
  }
  
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1rem;
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
  
  .back-btn {
    padding: 0.5rem 0.875rem;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #6b7280;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .back-btn:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
    color: #374151;
  }
  
  .error-state,
  .loading-state {
    text-align: center;
    padding: 2rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    color: #6b7280;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
  
  .loading-state {
    color: #4f46e5;
    font-weight: 500;
  }
  
  .user-info-card,
  .photo-sources-card,
  .stats-section,
  .chart-section,
  .history-section,
  .friends-section,
  .photos-section {
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20)),
                radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(255,255,255,.55);
    border-radius: 24px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 24px 68px rgba(0,0,0,.25);
    backdrop-filter: blur(22px) saturate(140%);
  }
  
  .user-info-card h2,
  .stats-section h2,
  .chart-section h2,
  .history-section h2,
  .friends-section h2,
  .photos-section h2 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 0.75rem 0;
  }
  
  .friends-list {
    display: grid;
    gap: 0.75rem;
  }
  
  .friend-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.875rem 1rem;
    background: linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,.25));
    backdrop-filter: blur(15px) saturate(140%);
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.4);
    transition: all 0.2s;
  }
  
  .friend-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(79,70,229,.2);
    border-color: rgba(255,255,255,.6);
  }
  
  .friend-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .friend-email {
    font-weight: 600;
    color: #111;
    font-size: 0.875rem;
  }
  
  .friend-id {
    font-family: monospace;
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .friend-date {
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .photos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }
  
  .photo-card {
    background: linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,.25));
    backdrop-filter: blur(15px) saturate(140%);
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.4);
    overflow: hidden;
    transition: all 0.2s;
  }
  
  .photo-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(79,70,229,.25);
    border-color: rgba(255,255,255,.6);
  }

  .photo-image-wrapper {
    position: relative;
    width: 100%;
    height: 200px;
    overflow: hidden;
  }
  
  .photo-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .delete-photo-btn-wrapper {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 10;
  }
  
  .photo-info {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .photo-date {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
  }
  
  .photo-emotions {
    font-size: 0.7rem;
    color: #4f46e5;
    font-weight: 500;
    text-transform: capitalize;
  }
  
  .emotion-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(255,255,255,.3);
  }
  
  .emotion-tab {
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    border: 2px solid rgba(255,255,255,.3);
    background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.20));
    backdrop-filter: blur(22px) saturate(140%);
    color: rgba(255, 255, 255, 0.9);
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    text-shadow: 0 2px 4px rgba(0,0,0,.2);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  
  .emotion-tab:hover {
    background: rgba(255, 255, 255, 0.3);
    border-color: rgba(255, 255, 255, 0.5);
    transform: translateY(-1px);
  }
  
  .emotion-tab.active {
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    color: white;
    border-color: rgba(255,255,255,.4);
    box-shadow: 0 4px 12px rgba(79,70,229,.35);
  }
  
  .emotion-count {
    opacity: 0.8;
    font-size: 0.75rem;
  }
  
  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }
  
  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .info-label {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .info-value {
    font-size: 1rem;
    font-weight: 700;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    font-family: monospace;
  }

  .info-value-muted {
    background: none;
    color: #9ca3af;
    font-weight: 500;
  }

  .info-item-full {
    grid-column: 1 / -1;
  }

  .organizations-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .org-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    background: rgba(79, 70, 229, 0.1);
    border: 1px solid rgba(79, 70, 229, 0.3);
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 600;
    color: #4f46e5;
    text-decoration: none;
    transition: background 0.2s, border-color 0.2s;
  }

  .org-tag:hover {
    background: rgba(79, 70, 229, 0.2);
    border-color: rgba(79, 70, 229, 0.5);
  }

  .org-role-badge {
    font-size: 0.65rem;
    padding: 0.125rem 0.375rem;
    background: rgba(79, 70, 229, 0.25);
    border-radius: 4px;
    font-weight: 700;
    text-transform: uppercase;
  }
  
  .role-badge {
    display: inline-block;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    background: linear-gradient(135deg, #e5e7eb, #d1d5db);
    color: #374151;
    font-size: 0.75rem;
    font-weight: 700;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .photo-sources-help {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0 0 1rem 0;
  }
  .photo-sources-checkboxes {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .photo-source-checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.9375rem;
  }
  .photo-source-checkbox input {
    width: 1.125rem;
    height: 1.125rem;
    cursor: pointer;
  }
  .save-photo-sources-btn {
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid rgba(79, 70, 229, 0.3);
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    color: white;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  .save-photo-sources-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  }
  .save-photo-sources-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .loading-inline {
    margin: 0;
    font-size: 0.875rem;
    color: #6b7280;
  }

  .role-badge.admin {
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    color: #92400e;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
  }
  
  .game-type-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }
  
  .game-stat-card {
    background: linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,.25)),
                radial-gradient(120% 120% at 0% 0%, rgba(255,111,145,.15), transparent 60%),
                radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.15), transparent 60%);
    backdrop-filter: blur(15px) saturate(140%);
    border-radius: 16px;
    padding: 1rem;
    border: 1px solid rgba(255,255,255,.4);
    box-shadow: 0 12px 40px rgba(0,0,0,.2);
    transition: all 0.2s;
  }
  
  .game-stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 48px rgba(79,70,229,.3);
    filter: brightness(1.05);
    border-color: rgba(255,255,255,.6);
  }
  
  .game-stat-card h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111;
    margin: 0 0 0.5rem 0;
  }
  
  .stat-metrics {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .metric {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .metric-label {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
  }
  
  .metric-value {
    font-size: 1rem;
    font-weight: 700;
    background: linear-gradient(135deg, #4f46e5, #22d3ee);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  
  .chart-card {
    background: #f9fafb;
    border-radius: 6px;
    padding: 1rem;
    border: 1px solid #e5e7eb;
  }
  
  .history-table-container {
    overflow-x: auto;
  }
  
  .history-table {
    width: 100%;
    border-collapse: collapse;
  }
  
  .history-table th {
    text-align: left;
    padding: 0.75rem 1rem;
    font-weight: 600;
    font-size: 0.75rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }
  
  .history-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #f3f4f6;
    color: #374151;
    font-size: 0.875rem;
  }
  
  .history-table tbody tr:hover {
    background: #f9fafb;
  }
  
  .history-table tbody tr:last-child td {
    border-bottom: none;
  }
  
  .empty-state {
    text-align: center;
    padding: 2rem;
    color: #9ca3af;
    font-size: 0.875rem;
  }
  
  @media (max-width: 768px) {
    .info-grid,
    .game-type-stats {
      grid-template-columns: 1fr;
    }
  }
</style>
